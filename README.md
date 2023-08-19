# ETL XML DataProcessor Ingestor with OpenSearch, S3, AWS SDK, DynamoDB, Node.js, and Lambda
This repository contains a Node.js application designed to perform ETL (Extract, Transform, Load) operations on XML data. The application leverages various AWS services, including OpenSearch, S3, AWS SDK, and DynamoDB, and is intended to be deployed as an AWS Lambda function.

## Table of Contents
- Overview
- Components
- Middleware
- Process Files
- Configuration
  - Sync ES Data
  - Upload File
  - Transformer Utility
- Setup and Installation
  - Commands

### Overview
The application is structured to process XML files, transform the data, and then ingest it into various AWS services.

## Components
- ### Middleware (middleware.js)
    - Responsible for validating a user.
    - Checks if the user exists in DynamoDB.
    - If the user does not exist in DynamoDB, it sends a response with a status of 401 and a message "Unauthorized".
- ### Process Files (processFiles.js)
    - Responsible for processing XML files.
    - Fetches XML data from the S3 bucket named todo.
    - Transforms this XML data into JSON format.
    - Stores the transformed JSON data in another S3 bucket named done.
    - Creates domains for OpenSearch dynamically.
    - Stores credentials in the database at runtime.
- ### Configuration (config.js)
    - Contains configurations for AWS services such as DynamoDB, OpenSearch, and S3.
    - Requires environment variables provided in a .env file (excluded from the repository for security reasons).
- ### Sync ES Data (syncESData.js)
    - Responsible for syncing data with OpenSearch.
- ### Upload File (uploadFile.js)
    - Handles the uploading of files.
- ### Transformer Utility (utils/transformer.js)
    - Used for transforming XML data to JSON format.
- ### Setup and Installation
    - Create a .env file in the root directory of the project.
    - Populate the .env file with the necessary environment variables as required by config.js.

### Commands
Install the necessary dependencies:

```npm install```

To start the project:

```npm start```
