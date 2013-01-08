'use strict';

var chai = require('chai');
var http = require('http');
var accum = require('accum');
var benchrest = require('../'); // require('bench-rest');
var t = chai.assert;
var httpServer;
var requests = []; // array for tracking requests to http server

suite('bench-rest');

before(function (done) {
  // Start an HTTP server
  httpServer = http.createServer(function (request, response) {
    request.pipe(accum.string('utf8', function (str) { // accumululate any incoming data
      requests.push({ method: request.method, url: request.url, data: str }); // save these
    }));
    if (request.url === '/makeError') { // create an unauthorized 401 error for this URL only
      response.writeHead(401, {"Content-Type": "text/plain"});
      response.end('Unauthorized');
    } else { // all other requests get 200 success with Hello World
      response.writeHead(200, {"Content-Type": "text/plain"});
      response.end("Hello World");
    }
  }).listen(8000);
  done();
});

after(function (done) {
  httpServer.close(function () { done(); });
});

test('simple get', function (done) {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    requests: 100
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.requests);
      done();
    });
});

test('stats provides measured data with totalElapsed and main metrics', function (done) {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    requests: 100
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) done(errors[0] || 'unknown error');
      t.isNumber(stats.totalElapsed, 'should have total elapsed time in millisecs');
      t.equal(stats.main.meter.count, runOptions.requests, 'should have count equal to the requests made');
      t.isNumber(stats.main.meter.mean, 'should have an average for iterations/sec');
      t.isNumber(stats.main.histogram.min, 'should have a min time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.max, 'should have a max time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.sum, 'should have a sum time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.mean, 'should have a mean time in milliseconds for all iterations');
      t.isNumber(stats.main.histogram.p95, 'should have a 95 percentile time in milliseconds for all iterations');
      done();
    });
});

test('simple put/get flow', function (done) {
  var flow = {
    main: [
      { put: 'http://localhost:8000/foo', json: 'mydata' },
      { get: 'http://localhost:8000/foo' }
    ]
  };
  var runOptions = {
    limit: 1,   // limiting to single at a time so can guarantee order for test verification
    requests: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.requests * flow.main.length);
      t.deepEqual(requests[0], { method: 'PUT', url: '/foo', data: '"mydata"' });
      t.deepEqual(requests[1], { method: 'GET', url: '/foo', data: '' });
      t.deepEqual(requests[2], { method: 'PUT', url: '/foo', data: '"mydata"' });
      t.deepEqual(requests[3], { method: 'GET', url: '/foo', data: '' });
      done();
    });
});

test('put/get flow with token substitution', function (done) {
  var flow = {
    main: [
      { put: 'http://localhost:8000/foo_#{INDEX}', json: 'mydata_#{INDEX}' },
      { get: 'http://localhost:8000/foo_#{INDEX}' }
    ]
  };
  var runOptions = {
    limit: 1,   // limiting to single at a time so can guarantee order for test verification
    requests: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) done(errors[0] || 'unknown error');
      t.equal(requests.length, runOptions.requests * flow.main.length);
      t.deepEqual(requests[0], { method: 'PUT', url: '/foo_0', data: '"mydata_0"' });
      t.deepEqual(requests[1], { method: 'GET', url: '/foo_0', data: '' });
      t.deepEqual(requests[2], { method: 'PUT', url: '/foo_1', data: '"mydata_1"' });
      t.deepEqual(requests[3], { method: 'GET', url: '/foo_1', data: '' });
      done();
    });
});

test('put/get flow with before, beforeMain, afterMain, after', function (done) {
  var flow = {
    before: [{ head: 'http://localhost:8000/beforeEverything' }],
    beforeMain: [{ head: 'http://localhost:8000/foo_#{INDEX}?beforeEachIteration' }],
    main: [
      { put: 'http://localhost:8000/foo_#{INDEX}', json: 'mydata_#{INDEX}' },
      { get: 'http://localhost:8000/foo_#{INDEX}' }
    ],
    afterMain: [{ del: 'http://localhost:8000/foo_#{INDEX}?afterEachIteration' }],
    after: [{ head: 'http://localhost:8000/afterEverything' }]
  };
  var runOptions = {
    limit: 1,   // limiting to single at a time so can guarantee order for test verification
    requests: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      if (errorCount) done(errors[0] || 'unknown error');
      var totalRequests = runOptions.requests *
        (flow.main.length + flow.beforeMain.length + flow.afterMain.length) +
        flow.before.length + flow.after.length;
      t.equal(requests.length, totalRequests);
      t.deepEqual(requests[0], { method: 'HEAD', url: '/beforeEverything', data: '' });
      t.deepEqual(requests[1], { method: 'HEAD', url: '/foo_0?beforeEachIteration', data: '' });
      t.deepEqual(requests[2], { method: 'PUT', url: '/foo_0', data: '"mydata_0"' });
      t.deepEqual(requests[3], { method: 'GET', url: '/foo_0', data: '' });
      t.deepEqual(requests[4], { method: 'DELETE', url: '/foo_0?afterEachIteration', data: '' });
      t.deepEqual(requests[5], { method: 'HEAD', url: '/foo_1?beforeEachIteration', data: '' });
      t.deepEqual(requests[6], { method: 'PUT', url: '/foo_1', data: '"mydata_1"' });
      t.deepEqual(requests[7], { method: 'GET', url: '/foo_1', data: '' });
      t.deepEqual(requests[8], { method: 'DELETE', url: '/foo_1?afterEachIteration', data: '' });
      t.deepEqual(requests[9], { method: 'HEAD', url: '/afterEverything', data: '' });
      done();
    });
});

test('errors should be emitted and errorCount should return total', function (done) {
  var flow = {
    main: [
      { get: 'http://localhost:8000/foo' },
      { put: 'http://localhost:8000/makeError', json: 'mydata' }
    ]
  };
  var runOptions = {
    limit: 2,
    requests: 2
  };
  var errors = [];
  requests.length = 0;
  benchrest(flow, runOptions)
    .on('error', function (err) { errors.push(err); })
    .on('end', function (stats, errorCount) {
      t.equal(errors.length, runOptions.requests, 'should have one error per iteration');
      t.match(errors[0].message, /401/);
      t.match(errors[1].message, /401/);
      done();
    });
});


test('missing requests property throws error', function () {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    // requests: 100
  };
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark runOptions requires requests and limit properties/,
           'should throw when missing required property runOptions.requests');
});

test('missing limit property throws error', function () {
  var flow = {
    main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    // limit: 10,
    requests: 100
  };
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark runOptions requires requests and limit properties/,
           'should throw when missing required property runOptions.limit');
});

test('missing main flow throws error', function () {
  var flow = {
    // main: [{ get: 'http://localhost:8000' }]
  };
  var runOptions = {
    limit: 10,
    requests: 100
  };
  function runWhichThrows() {
    benchrest(flow, runOptions);
  }
  t.throws(runWhichThrows, /benchmark flow requires an array of operations as property main/,
           'should throw when missing flow.main');

});
