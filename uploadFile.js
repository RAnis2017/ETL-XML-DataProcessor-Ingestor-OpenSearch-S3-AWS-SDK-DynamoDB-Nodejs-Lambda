const AWS = require('aws-sdk');
const Busboy = require('busboy');
const { validateUser } = require('./middleware');
const { AWS_ACCESS_KEY_ID_NODE, AWS_SECRET_ACCESS_KEY_NODE, AWS_REGION, AWS_BUCKET_NAME } = require('./config');

const s3 = new AWS.S3({
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID_NODE,
    secretAccessKey: AWS_SECRET_ACCESS_KEY_NODE
});

exports.handler = async (event, context, callback) => {
    const user = await validateUser(event);
    
    if (!user) {
        return { statusCode: 403, body: 'Invalid or inactive user' };
    }

    const busboy = Busboy({
        headers: {
            'content-type': event.headers['content-type'] || event.headers['Content-Type']
        }
    });

    const result = {};

    return new Promise((resolve, reject) => {
      busboy.on('file', (fieldname, file, fileInfo) => {
         file.on('data', data => {
            result.content = data;
            console.log("got data... " + data.length + ' bytes');
         });

         file.on('end', () => {
            const { filename, mimeType } = fileInfo;

            console.log("got end... " + filename + ' ' + mimeType);

            const params = {
                Bucket: AWS_BUCKET_NAME,
                Key: user  + '.xml',
                Body: result.content,
                ContentType: mimeType
            };

            s3.upload(params, (err, data) => {
                if (err) {
                    console.log(err);
                    callback(err);
                } else {
                    console.log(data);

                    callback(null, {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: 'File uploaded successfully',
                            url: data.Location
                        })
                    });
                }
            });

         });
      });

      busboy.on('error', error => reject(error));
      busboy.write(event.body, event.isBase64Encoded ? 'base64' : 'binary');
      busboy.end();
   });
};
