const expect = require('chai').expect;
const parse = require('../parser').parse;

describe('parse()', function () {
    it('should return array of results', async function () {
        
        var pathToTestFiles = "./test/testdata";

        var arrayOfResults = await parse(pathToTestFiles, {})

        expect(arrayOfResults.length).to.be.equal(30)
    });
});