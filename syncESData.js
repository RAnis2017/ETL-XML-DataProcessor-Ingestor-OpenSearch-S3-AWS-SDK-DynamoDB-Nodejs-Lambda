const AWS = require("aws-sdk");
const {
  AWS_ACCESS_KEY_ID_NODE,
  AWS_SECRET_ACCESS_KEY_NODE,
  AWS_REGION,
  AWS_BUCKET_NAME,
  AWS_BUCKET_DONE_NAME,
  AWS_ACCOUNT_ID,
} = require("./config");
const { isArray } = require("lodash");

AWS.config.update({ region: AWS_REGION });

const s3 = new AWS.S3({
  region: AWS_REGION,
  accessKeyId: AWS_ACCESS_KEY_ID_NODE,
  secretAccessKey: AWS_SECRET_ACCESS_KEY_NODE,
});

const dynamoDb = new AWS.DynamoDB.DocumentClient();

// Create an OpenSearchService client
const OpenSearchClient = new AWS.OpenSearch({
  region: AWS_REGION,
  accessKeyId: AWS_ACCESS_KEY_ID_NODE,
  secretAccessKey: AWS_SECRET_ACCESS_KEY_NODE,
});

const { Client } = require("@opensearch-project/opensearch");

exports.handler = async (event, context, callback) => {
  const params = {
    Bucket: AWS_BUCKET_DONE_NAME,
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    for (const content of data.Contents) {
      const fileName = content.Key;
      const userGuid = fileName.split(".")[0].split("/")[1]; // Assuming filename format is GUID.xml
      const fileType = fileName.split("/")[1].split(".");
      if (fileType.includes("json")) {
        // Fetch user data from DynamoDB
        const user = await getUser(userGuid);

        if (!user || user.Inactive !== "") {
          continue;
        }

        // Fetch XML file from S3 bucket
        const fileParams = {
          Bucket: AWS_BUCKET_DONE_NAME,
          Key: fileName,
        };
        const fileData = await s3.getObject(fileParams).promise();
        const parsedData = JSON.parse(fileData.Body.toString("utf-8"));

        const ingestFieldsAsIndexes = Object.keys(parsedData[0]);

        const dataToIngest = ingestFieldsAsIndexes.reduce(
          (prevVal, currVal) => {
            prevVal[currVal] = [];

            return prevVal;
          },
          {}
        );
        parsedData.forEach((data) => {
          Object.keys(data).forEach((key) => {
            isArray(data[key])
              ? dataToIngest[key].push(...data[key])
              : dataToIngest[key].push(data[key]);
          });
        });

        OpenSearchClient.describeDomain(
          {
            DomainName: user.DomainName
          },
          async function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else {
              const ENDPOINT = data.DomainStatus.Endpoint;

              // Save the master user and password to the users table
              const paramsUpdateUser = {
                TableName: "users", // replace with your table name
                Item: {
                  ...user,
                  ID: userGuid,
                  DomainEndpoint: ENDPOINT,
                },
              };

              await dynamoDb.put(paramsUpdateUser).promise();

              const OpenSearchAuth = `${userGuid}:${user.MasterPassword}`;

              const OpenSearchIngestClient = new Client({
                node: 'https' + "://" + OpenSearchAuth + "@" + ENDPOINT,
              });

              await syncDataToES(dataToIngest, ingestFieldsAsIndexes, OpenSearchIngestClient)
            }
          }
        );
      }
    }

    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: "Data Ingested and saved in ElasticSearch Successfully.",
      }),
    });
  } catch (error) {
    console.log(error);
    callback(error);
  }
};

async function syncDataToES(data, indexes, OpenSearchClient) {
  if (Object.keys(data).length !== Object.keys(indexes).length) {
    throw new Error("Data and index arrays must be of the same length");
  }

  // Iterate through the data and index them into the respective indexes
  indexes.forEach(async (index) => {
    const currentIndex = index.toLowerCase();
    const currentData = data[index];

    // Create an index if it doesn't exist
    const indexExists = await OpenSearchClient.indices.exists({
      index: currentIndex,
    });
    if (indexExists.statusCode === 404) {
      await OpenSearchClient.indices.create({ index: currentIndex });
      console.log('Created ES Index: ' + currentIndex);
    }

    // Index the data
    const transformedData = [];
    currentData.forEach(item => {
        // For each item, you push the action metadata and then the source document
        let uniqueId;
        
        switch (currentIndex) {
            case 'project':
                uniqueId = 'ProjectId';
                break;
            case 'company':
                uniqueId = 'CompanyId';
                break;
            case 'contact':
                uniqueId = 'Id';
                break;
            case 'projectcompanyrelation':
                uniqueId = 'ProjectId';
                break;
            default:
                uniqueId = 'Id';
                break;
        }
        
        transformedData.push({ index: { _index: currentIndex, _id: item[uniqueId] } });
        transformedData.push(item);
    });

    await OpenSearchClient.bulk({
      index: currentIndex,
      body: transformedData,
    });

    console.log("Data Inserted to Index: " + currentIndex);
  });
  
}

async function getUser(guid) {
  const params = {
    TableName: "users", // replace with your table name
    Key: { ID: guid },
  };

  const result = await dynamoDb.get(params).promise();
  return result.Item;
}
