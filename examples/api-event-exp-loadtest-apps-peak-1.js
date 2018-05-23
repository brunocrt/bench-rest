'use strict';

var BASE_URL = 'http://localhost:4000/event_experience/v1';
var DEFAULT_EVENT_ID = '5b05802b264a0e1c54828e32';
var CUSTOMER_NAME_PREFIX = "cliente"

var flow = {
  before: [],      // operations to do before anything
  beforeMain: [],  // operations to do before each iteration
  main: [  // the main flow for each iteration, #{INDEX} is unique iteration counter token
    { // REGISTER
      post: BASE_URL + '/auth/register',
      beforeHooks: [ logRequestInit ],
      json: {name: CUSTOMER_NAME_PREFIX+'#{INDEX}', email: CUSTOMER_NAME_PREFIX+'#{INDEX}@mycompany.com', password: '1234', cell_phone: '551512345678', company_name: 'MyCompany', company_position: 'Analyst'},
      afterHooks: []
    },
    { // LOGIN
      post: BASE_URL + '/auth/login',
      json: {login: CUSTOMER_NAME_PREFIX+'#{INDEX}@mycompany.com', password: '1234'},
      afterHooks: [ captureAccessToken ]
    },
    { // PATCH CUSTOMERS/ME - Authorization: Bearer 
      patch: BASE_URL + '/customers/me',
      beforeHooks: [ provideAccessToken ],
      json: { notification_devices: [ { device_type: 'ANDROID', device_id: 'invalid-id' } ], notification_topics: [ '/events/'+ DEFAULT_EVENT_ID ], interest: [ 'AI' ]},
      afterHooks: [ captureCustomerId ]
    },
    { // GET CONTENT
      get: BASE_URL + '/contents?event_id=' + DEFAULT_EVENT_ID,
      beforeHooks: [ provideAccessToken ]
    },
    { // GET SESSIONS
      get: BASE_URL + '/events/' + DEFAULT_EVENT_ID + '/sessions',
      beforeHooks: [ provideAccessToken ]
    },
    { // POST INTERACTIONS
      post: BASE_URL + '/interactions',
      json: { event_id: DEFAULT_EVENT_ID, type: 'DOWNLOAD', media: 'ANDROID', source: 'Open-Banking.pdf'},
      beforeHooks: [ provideCustomerId ]
    }
  ],
  afterMain: [],   // operations to do after each iteration
  after: []        // operations to do after everything is done
};

module.exports = flow;

// These are identical to the core hooks named the same thing,
// so you can use them by just using the string name.

function logRequestInit(all) {
  console.log('>>>>>>> logRequestInit: requestOptions: ', all.requestOptions.uri);
  return all;
}

function captureAccessToken(all) {
  console.log('>>>>>>> captureAccessToken')
  if(all.response.body.data && all.response.body.data.access_token) {
    all.iterCtx.access_token = all.response.body.data.access_token;
  }
  return all;
}

function provideAccessToken(all) {
  console.log('>>>>>>> provideAccessToken')
  if (all.iterCtx.access_token) {
    var access_token = all.iterCtx.access_token;
    all.requestOptions.headers.Authorization = 'Bearer ' + access_token;
  }
  return all;
}

function captureCustomerId(all) {
  console.log('>>>>>>> captureCustomerId')
  if(all.response.body.data && all.response.body.data._id) {
    all.iterCtx.customer_id = all.response.body.data._id;
  }
  return all;
}

function provideCustomerId(all) {
  console.log('>>>>>>> provideCustomerId')
  if (all.iterCtx.customer_id) {
    var customer_id = all.iterCtx.customer_id;
    all.requestOptions.json.customer_id = customer_id;
  }
  return all;
}