"use strict";

const fs = require("fs");
const globby = require("globby");
const xml2js = require("xml2js");
const path = require("path");
const archiver = require("archiver");
const os = require("os");

const MAX_LOG_FILE = 5;
const SERENIT_FILE_NAME_FORMAT = "**/SERENITY-JUNIT*.xml";
const timestamp = new Date();

// delete folder  recursively
function deleteFolderSync(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach(function (file, index) {
      var curPath = folderPath + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderSync(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
};

function zipFolder(folderPath, filePattern, outputFilePath) {
  return new Promise(function (resolve, reject) {
    var output = fs.createWriteStream(outputFilePath);
    var zipArchive = archiver('zip');

    output.on('close', function () {
      console.log(zipArchive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      resolve(undefined);
    });

    output.on('end', function () {
      console.log('Data has been drained');
      resolve(undefined);
    });

    zipArchive.on('warning', function (err) {
      if (err.code === 'ENOENT') {
        // log warning
      } else {
        reject(err);
      }
    });

    zipArchive.on('error', function (err) {
      reject(err);
    });

    // pipe archive data to the file
    zipArchive.pipe(output);

    zipArchive.glob(filePattern, {
      cwd: folderPath
    });
    zipArchive.finalize(function (err, bytes) {
      if (err) {
        reject(err);
      }
    });
  })

}

function buildTestResultByMethodName(obj) {
  if (!obj || !obj.$ || !obj.$.name) {
    return undefined;
  }
  let name = obj.$.classname ? `${obj.$.classname}#${obj.$.name}` : obj.$.name;
  let exe_start_date = new Date(timestamp);
  let exe_end_date = new Date(timestamp);
  exe_end_date.setSeconds(exe_start_date.getSeconds() + (parseInt(obj.$.time || 0, 10)));

  let status = (undefined != obj.skipped) ? "SKIP" : obj.failure ? "FAIL" : "PASS";
  let testCase = {
    status: status,
    name: name,
    attachments: [],
    exe_start_date: exe_start_date.toISOString(),
    exe_end_date: exe_end_date.toISOString(),
    automation_content: name,
    test_step_logs: [{
      order: 0,
      status: status,
      description: obj.$.name,
      expected_result: obj.$.name
    }]
  };
  if (obj.failure) {
    testCase.attachments.push({
      name: `${obj.$.name}.txt`,
      data: Buffer.from(obj.failure._).toString("base64"),
      content_type: "text/plain"
    });
  }
  return testCase;
}

function parseFile(fileName) {
  return new Promise((resolve, reject) => {
    let jsonString = fs.readFileSync(fileName, "utf-8");
    xml2js.parseString(jsonString, {
      preserveChildrenOrder: true,
      explicitArray: false,
      explicitChildren: false
    }, function (err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

function collectTestFiles(pathToTestResult) {
    var resultFiles = [];
    
    if (fs.statSync(pathToTestResult).isFile()) {
        resultFiles.push(pathToTestResult);
      }
      if (fs.statSync(pathToTestResult).isDirectory()) {
        let pattern = undefined;
        pathToTestResult = pathToTestResult.replace(/\\/g, "/");
        if (pathToTestResult[pathToTestResult.length - 1] === '/') {
          pattern = pathToTestResult + SERENIT_FILE_NAME_FORMAT;
        } else {
          pattern = pathToTestResult + "/" + SERENIT_FILE_NAME_FORMAT;
        }
        resultFiles = globby.sync(pattern);
      }

      return resultFiles;
}

async function parse(pathToTestResult, options) {
  var useClassNameAsTestCaseName = options.useClassNameAsTestCaseName || false;
  if (!fs.existsSync(pathToTestResult)) {
    throw new Error(`Test result not found at ${pathToTestResult}`);
  }
  console.log("Path to test result: " + pathToTestResult);
  
  let resultFiles = collectTestFiles(pathToTestResult);
  
  if (0 === resultFiles.length) {
    throw new Error(`Could not find any result log-file(s) in: ' + pathToTestResult`);
  }

  let resultMap = new Map();
  let order = 1;
  for (let file of resultFiles) {
    console.log(`Parsing ${file} ...`);
    let parseFileResult = undefined;
    try {
      parseFileResult = await parseFile(file);
    } catch (error) {
      console.error(`Could not parse ${file}`, error);
      continue;
    }
    
    let testSuite = parseFileResult.testsuites ? parseFileResult.testsuites.testsuite : parseFileResult.testsuite;
    let testcases = [];
    if (Array.isArray(testSuite)) {
      testcases = testSuite;
    } else {
      testcases = Array.isArray(testSuite.testcase) ? testSuite.testcase : [testSuite.testcase];
    }
    for (let tc of testcases) {
      let tcObj = buildTestResultByMethodName(tc);
      if (tcObj && !resultMap.has(tcObj.automation_content)) {
        tcObj.order = order++;
        resultMap.set(tcObj.automation_content, tcObj);
      }
    }
    console.log(`Finish parsing ${file}`);
  }
  return (Array.from(resultMap.values()));
};

module.exports = {
  parse,
  collectTestFiles,
  parseFile,
  buildTestResultByMethodName,
};