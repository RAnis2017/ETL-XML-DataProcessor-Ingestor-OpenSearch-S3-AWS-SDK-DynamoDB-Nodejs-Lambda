const AWS = require('aws-sdk');
const { AWS_ACCESS_KEY_ID_NODE, AWS_SECRET_ACCESS_KEY_NODE, AWS_REGION } = require('./config');
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID_NODE,
    secretAccessKey: AWS_SECRET_ACCESS_KEY_NODE
});

const validateUser = async (event) => {
    if (!event.headers['authorization'] && !event.headers['Authorization']) {
        return false;
    }

    const bearerHeader = event.headers['authorization'] || event.headers['Authorization'];
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    event.token = bearerToken;

    const params = {
        TableName: 'users',
        Key: {
            'ID': bearerToken
        }
    };

    try {
        const data = await dynamoDB.get(params).promise();
        if (!data.Item || data.Item.Inactive !== '') {
            return false;
        }
        return bearerToken;
    } catch (err) {
        console.log(err);
        return false;
    }
};

module.exports = {
    validateUser,
};
