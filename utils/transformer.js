const _ = require("lodash");
const crypto = require("crypto");

const mapValue = (sourceData, key) => {
  if (key.startsWith("HASH")) {
    let input = key.match(/\((.*)\)/)[1].split(",");
    return crypto
      .createHash("sha256")
      .update(_.get(sourceData, input[0]) + _.get(sourceData, input[1]))
      .digest("hex");
  } else if (key.startsWith("FIRSTNAME") || key.startsWith("LASTNAME")) {
    let fullName = _.get(sourceData, key.match(/\((.*)\)/)[1]);
    let nameParts = fullName.split(" ");
    if (nameParts.length >= 2) {
        return key.startsWith("FIRSTNAME")
            ? nameParts[0]
            : nameParts[nameParts.length - 1];
    } else {
        return key.startsWith("FIRSTNAME") ? fullName : "";
    }
  } else {
    return _.get(sourceData, key);
  }
};

const mapData = (data, mapping) => {
  const result = {};

  for (let key in mapping) {
    if (mapping.hasOwnProperty(key)) {
      _.set(result, mapping[key], mapValue(data, key));
    }
  }

  // remove the mapping key from the result and include other keys
  let dataObj = {};
  if (Object.keys(mapping)[0].includes('.')) {
    dataObj = data[Object.keys(mapping)[0].split('.')[0]];
  } else {
    dataObj = data;
  }

  for (let key in dataObj) {
    if (dataObj.hasOwnProperty(key)) {
      let checkKey = key;
      if (Object.keys(mapping)[0].includes('.')) {
        checkKey = Object.keys(mapping)[0].split('.')[0] + '.' + key;
      }
      if (!mapping.hasOwnProperty(checkKey)) {
        _.set(result, key, _.get(dataObj, key));
      }
    }
  }

  return result;
};

const transformData = (data, config) => {
  let transformedData = [];
  let rootPath = "Projects.Project";
  let dataItems = _.get(data, rootPath);
  dataItems.map((dataItem) => {
    let transformedDataItem = {};
    for (let key in config) {
      if (config.hasOwnProperty(key)) {
        if (config[key].parent) {
          let childData = [];
          let childObjKey = "";
          if (config[key].path === ".") {
            childData = _.get(dataItem, config[config[key].parent].path);
            childObjKey = config[config[key].parent].path.split(".").pop();
          } else {
            childData = _.get(dataItem, config[key].path);
            childObjKey = config[key].path.split(".").pop();
          }
          if (childData) {
            if (!Array.isArray(childData)) {
              childData = [childData];
            }
            childData.map((childDataItem) => {
              let mappedData = mapData(
                {
                  [childObjKey]: childDataItem,
                },
                config[key].mapping
              );
              transformedDataItem[key] = transformedDataItem[key] || [];
              transformedDataItem[key].push(mappedData);
            });
          }
        } else if (config[key].parents) {
          let childData = [];
          let childObjKey = '';
          let parentData = {};
          config[key].parents.map((parent) => {
            if (parent === "project") {
              parentData[parent] = dataItem;
            } else {
              parentData[parent] = _.get(dataItem, config[parent].path);
            }
          });
          
          // "projectCompanyRelation": {
          //   "parents": ["project", "company"],
          //   "Project.DRNumber": "ProjectId",
          //   "Company.FactorKey": "CompanyId",
          //   "Company.FactorType": "Role"
          // }

          Object.keys(config[key]).forEach((internalKey) => {
            if (internalKey !== "parents") {
              childObjKey = internalKey.split(".")[0];
              transformedDataItem[key] = {
                ...transformedDataItem[key],
                [config[key][internalKey]]: Array.isArray(transformedDataItem[childObjKey.toLowerCase()]) ?
                  transformedDataItem[childObjKey.toLowerCase()].map((item) => item[config[key][internalKey]]) : 
                  transformedDataItem[childObjKey.toLowerCase()][config[key][internalKey]]
              }

            }
          });
          
        } else {
          let mappedData = mapData(dataItem, config[key].mapping);
          transformedDataItem[key] = mappedData;
        }
      }
    }
    transformedData.push(transformedDataItem);
  });
  return transformedData;
};

module.exports = {
  transformData,
};
