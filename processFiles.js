const AWS = require("aws-sdk");
const xml2js = require("xml2js");
const { transformData } = require("./utils/transformer");
const {
  dodgeTransformation,
} = require("./utils/transformations/transformations.dodge");
const {
  AWS_ACCESS_KEY_ID_NODE,
  AWS_SECRET_ACCESS_KEY_NODE,
  AWS_REGION,
  AWS_BUCKET_NAME,
  AWS_BUCKET_DONE_NAME,
  AWS_ACCOUNT_ID,
} = require("./config");

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

exports.handler = async (event, context, callback) => {
  const params = {
    Bucket: AWS_BUCKET_NAME,
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    for (const content of data.Contents) {
      const fileName = content.Key;
      const userGuid = fileName.split(".")[0]; // Assuming filename format is GUID.xml

      // Fetch user data from DynamoDB
      const user = await getUser(userGuid);

      if (!user || user.Inactive !== "") {
        continue;
      }

      // Fetch XML file from S3 bucket
      const fileParams = {
        Bucket: AWS_BUCKET_NAME,
        Key: fileName,
      };
      const fileData = await s3.getObject(fileParams).promise();

      // Parse and transform XML file
      const parser = new xml2js.Parser({ explicitArray: false });
      parser.parseString(
        fileData.Body.toString("utf-8"),
        async (error, result) => {
          if (error) {
            console.log(error);
            return error;
          } else {
            let config = {};

            switch (user.Provider) {
              case "dodge":
                config = dodgeTransformation;
                break;
              default:
                config = {};
            }

            // Transform the data

            const transformedData = transformData(result, config);

            // Check against the picklist json files and replace the values with the picklist values if they exist

            // GET JSON FILES FROM Utils/picklist folder and compare the values for required fields

            const REQUIRED_FIELDS = [
              { ReportType: "project.reporttype.json" },
              { State: "system.country-state.json" },
              { Country: "system.country-state.json" },
              { PrimaryStage: "project.primarystage.json" },
              { SecondaryStage: "project.secondarystage.json" },
              { MarketSegment: "project.marketsegment.json" },
              { PrimaryProjectType: "project.primaryprojecttype.json" },
              { SecondaryProjectType: "project.secondaryprojecttype.json" },
              { TypeOfWork: "project.typeofwork.json" },
              { OwnershipType: "project.ownershiptype.json" },
              { DeliverySystem: "project.deliverysystem.json" },
              { FrameType: "project.frametype.json" },
              { Role: "company.role.json" },
              { CompanyState: "system.country-state.json" },
              { CompanyCountry: "system.country-state.json" },
            ];

            // Loop through the transformed data and check if the key exists in the required fields array

            // If it exists, check if the value exists in the picklist json file

            // If it exists, replace the value with the picklist value

            // If it doesn't exist, add the value to the dynamodb table picklist

            // If the key doesn't exist in the required fields array, continue

            for (let rootItem of transformedData) {
              for (let rootKey of Object.keys(rootItem)) {
                if (rootKey === "project" || rootKey === "company") {
                  if (rootKey === "project") {
                    delete rootItem[rootKey].Companies;
                  }

                  const item = rootItem[rootKey];

                  const checkPicklistFunction = async (item, key) => {
                    if (item.hasOwnProperty(key)) {
                      const value = item[key];
                      const requiredField = REQUIRED_FIELDS.find(
                        (field) => field[key]
                      );
                      if (requiredField) {
                        const picklistFile = requiredField[key];
                        const picklist = require(`./utils/picklist/${picklistFile}`);
                        let picklistValue;

                        if (picklist) {
                          if (key === "Country" || key === "CompanyCountry") {
                            picklistValue = picklist.find(
                              (item) => item.iso3 === value
                            );
                          } else if (
                            key === "CompanyState" ||
                            key === "State"
                          ) {
                            const country = picklist.find(
                              (pItem) =>
                                pItem.iso3 === item.Country ||
                                pItem.iso3 === item.CompanyCountry
                            );

                            if (country) {
                              picklistValue = country.states.find(
                                (state) => state.state_code === value
                              );
                            } else {
                              picklistValue = null;
                            }
                          } else {
                            picklistValue = Object.values(picklist).find(
                              (item) => item.value === value
                            );
                          }

                          if (picklistValue) {
                            if (
                              key === "Country" ||
                              key === "CompanyCountry" ||
                              key === "CompanyState" ||
                              key === "State"
                            ) {
                              item[key] = picklistValue.name;
                            } else {
                              item[key] = picklistValue.label;
                            }
                          } else {
                            // Add the value to the picklist dynamodb table if it doesn't exist
                            if (!!value) {
                              const picklistExists = await dynamoDb
                                .get({
                                  TableName: "picklist",
                                  Key: {
                                    ID: `${picklistFile}-${value}-${userGuid}`,
                                  },
                                })
                                .promise();

                              if (!picklistExists.Item) {
                                const params = {
                                  TableName: "picklist", // replace with your table name
                                  Item: {
                                    ID: `${picklistFile}-${value}-${userGuid}`,
                                    value,
                                    label: value,
                                    type: picklistFile,
                                    userGuid: userGuid,
                                  },
                                };

                                await dynamoDb.put(params).promise();
                              }
                            }
                          }
                        }
                      }
                    }
                  };

                  if (Array.isArray(item)) {
                    for (let innerItem of item) {
                      for (const key in innerItem) {
                        await checkPicklistFunction(innerItem, key);
                      }
                    }
                  } else {
                    for (const key in item) {
                      await checkPicklistFunction(item, key);
                    }
                  }
                }
              }
            }

            // Save transformed data to the 'done-eser' bucket
            let putParams = {
              Bucket: AWS_BUCKET_DONE_NAME,
              Key: `transformed/${fileName}.json`,
              Body: JSON.stringify(transformedData),
            };

            s3.putObject(putParams, function (err, data) {
              if (err) console.log(err, err.stack);
              else console.log(data);
            });

            putParams = {
              Bucket: AWS_BUCKET_DONE_NAME,
              Key: `original/${fileName}`,
              Body: fileData.Body,
            };

            s3.putObject(putParams, function (err, data) {
              if (err) console.log(err, err.stack);
              else {
                const deleteParams = {
                  Bucket: AWS_BUCKET_NAME,
                  Key: `${fileName}`,
                };

                s3.deleteObject(deleteParams, function (err, data) {
                  if (err) console.log(err, err.stack);
                  else console.log(data);
                });
              }
            });
            // CREATE OPEN SEARCH DOMAIN for this user if it doesn't exist already

            const checkDomainExists = await dynamoDb
              .get({
                TableName: "users",
                Key: {
                  ID: userGuid,
                },
              })
              .promise();

            if (
              checkDomainExists.Item &&
              checkDomainExists.Item.DomainName &&
              checkDomainExists.Item.DomainName !== ""
            ) {
              console.log("Domain already exists for this user. \nInserting data into the ES Index");
            } else {
              const domainName = "domain-" + userGuid.split("-").pop();

              const masterUser = userGuid;
              const masterPassword = await generateRandomPassword();

              const OSParams = {
                DomainName: domainName,
                EngineVersion: "OpenSearch_2.7",
                ClusterConfig: {
                  InstanceType: "t3.small.search",
                  InstanceCount: 1,
                  DedicatedMasterEnabled: true,
                  DedicatedMasterType: "t3.small.search",
                  DedicatedMasterCount: 2,
                },
                EncryptionAtRestOptions: {
                  Enabled: true,
                },
                DomainEndpointOptions: {
                  EnforceHTTPS: true,
                },
                EBSOptions: {
                  EBSEnabled: true,
                  VolumeType: "gp2",
                  VolumeSize: 10,
                },
                NodeToNodeEncryptionOptions: {
                  Enabled: true,
                },
                AdvancedSecurityOptions: {
                  Enabled: true,
                  InternalUserDatabaseEnabled: true,
                  MasterUserOptions: {
                    MasterUserName: masterUser,
                    MasterUserPassword: masterPassword,
                  },
                },
                AccessPolicies: JSON.stringify({
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Principal: {
                        AWS: "*",
                      },
                      Action: "es:*",
                      Resource: `arn:aws:es:${AWS_REGION}:${AWS_ACCOUNT_ID}:domain/${domainName}/*`,
                    },
                  ],
                }),
              };

              OpenSearchClient.createDomain(
                OSParams,
                async function (err, data) {
                  if (err) {
                    console.log(err, err.stack);
                  } else {
                    // Save the master user and password to the users table
                    const paramsUpdateUser = {
                      TableName: "users", // replace with your table name
                      Item: {
                        ...checkDomainExists.Item,
                        ID: userGuid,
                        MasterPassword: masterPassword,
                        DomainName: domainName,
                      },
                    };

                    await dynamoDb.put(paramsUpdateUser).promise();

                    console.log(
                      "Domain created successfully for user: " + userGuid + "\nInserting data into the ES Index"
                    );

                  }
                }
              );
            }
          }
        }
      );
    }

    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: "Data fetched, transformed and saved successfully.",
      }),
    });
  } catch (error) {
    console.log(error);
    callback(error);
  }
};

async function getUser(guid) {
  const params = {
    TableName: "users", // replace with your table name
    Key: { ID: guid },
  };

  const result = await dynamoDb.get(params).promise();
  return result.Item;
}

async function generateRandomPassword() {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const specialCharacters = "!@#$%^&*()_+[]{}|;:,.<>?";

  function getRandomCharacter(str) {
    return str.charAt(Math.floor(Math.random() * str.length));
  }

  // Ensuring at least one character from each category is present
  const passwordArray = [
    getRandomCharacter(uppercase),
    getRandomCharacter(lowercase),
    getRandomCharacter(numbers),
    getRandomCharacter(specialCharacters),
  ];

  // Fill the remaining length with random choices among all characters
  const allCharacters = uppercase + lowercase + numbers + specialCharacters;
  const remainingLength = 8 - passwordArray.length; // Assuming a minimum length of 8 for the password

  for (let i = 0; i < remainingLength; i++) {
    passwordArray.push(getRandomCharacter(allCharacters));
  }

  // Shuffle the array to ensure randomness, then convert to string
  return passwordArray.sort(() => 0.5 - Math.random()).join("");
}
