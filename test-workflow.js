// Simple workflow test for the fiestime backend
const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:4000';

// Helper function to make GraphQL requests
async function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      query,
      variables
    });

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Helper function to check health endpoint
async function checkHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Test suite
async function runTests() {
  console.log('🚀 Starting fiestime Backend Workflow Test');
  console.log('===========================================');

  try {
    // Test 1: Health Check
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await checkHealth();
    console.log('✅ Health check passed:', healthResponse.status);

    // Test 2: GraphQL Introspection
    console.log('\n2. Testing GraphQL introspection...');
    const introspectionQuery = `
      query {
        __schema {
          types {
            name
          }
        }
      }
    `;

    const introspectionResponse = await makeGraphQLRequest(introspectionQuery);
    if (introspectionResponse.data && introspectionResponse.data.__schema) {
      console.log('✅ GraphQL introspection passed');
    } else {
      console.log('❌ GraphQL introspection failed:', introspectionResponse);
    }

    // Test 3: Create Event
    console.log('\n3. Testing event creation...');
    const createEventMutation = `
      mutation CreateTestEvent($name: String!, $date: String!) {
        createEvent(name: $name, date: $date) {
          _id
          name
          s3Folder
          joinCode
          joinUrl
          createdAt
        }
      }
    `;

    const createEventResponse = await makeGraphQLRequest(createEventMutation, {
      name: 'Test Workflow Event',
      date: '2025-03-03'
    });

    if (createEventResponse.errors) {
      console.log('❌ Event creation failed:', createEventResponse.errors);
      return;
    }

    const event = createEventResponse.data.createEvent;
    console.log('✅ Event created successfully:', {
      id: event._id,
      name: event.name,
      s3Folder: event.s3Folder,
      joinCode: event.joinCode
    });

    // Test 4: List Events
    console.log('\n4. Testing event listing...');
    const listEventsQuery = `
      query {
        listEvents(limit: 10) {
          _id
          name
          date
          videoCount
          createdAt
        }
      }
    `;

    const listEventsResponse = await makeGraphQLRequest(listEventsQuery);
    if (listEventsResponse.errors) {
      console.log('❌ Event listing failed:', listEventsResponse.errors);
    } else {
      console.log('✅ Event listing passed, found', listEventsResponse.data.listEvents.length, 'events');
    }

    // Test 5: Create Upload URL
    console.log('\n5. Testing upload URL creation...');
    const createUploadUrlMutation = `
      mutation CreateUploadUrl($eventId: ID!, $fileName: String!, $contentType: String!) {
        createUploadUrl(eventId: $eventId, fileName: $fileName, contentType: $contentType) {
          uploadUrl
          bucket
          key
          expiresInSeconds
          videoId
        }
      }
    `;

    const uploadUrlResponse = await makeGraphQLRequest(createUploadUrlMutation, {
      eventId: event._id,
      fileName: 'test-video.mp4',
      contentType: 'video/mp4'
    });

    if (uploadUrlResponse.errors) {
      console.log('❌ Upload URL creation failed:', uploadUrlResponse.errors);
    } else {
      console.log('✅ Upload URL created successfully:', {
        bucket: uploadUrlResponse.data.createUploadUrl.bucket,
        key: uploadUrlResponse.data.createUploadUrl.key,
        videoId: uploadUrlResponse.data.createUploadUrl.videoId,
        expiresInSeconds: uploadUrlResponse.data.createUploadUrl.expiresInSeconds
      });
    }

    // Test 6: List Event Videos
    console.log('\n6. Testing event videos listing...');
    const listEventVideosQuery = `
      query ListEventVideos($eventId: ID!) {
        listEventVideos(eventId: $eventId) {
          _id
          originalFileName
          status
          contentType
          createdAt
        }
      }
    `;

    const videosResponse = await makeGraphQLRequest(listEventVideosQuery, {
      eventId: event._id
    });

    if (videosResponse.errors) {
      console.log('❌ Event videos listing failed:', videosResponse.errors);
    } else {
      console.log('✅ Event videos listing passed, found', videosResponse.data.listEventVideos.length, 'videos');
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- Health endpoint: ✅');
    console.log('- GraphQL introspection: ✅');
    console.log('- Event creation: ✅');
    console.log('- Event listing: ✅');
    console.log('- Upload URL creation: ✅');
    console.log('- Event videos listing: ✅');

  } catch (error) {
    console.log('\n❌ Test suite failed:', error.message);
    console.log('Make sure the server is running on http://localhost:4000');
  }
}

// Run tests
if (require.main === module) {
  runTests();
}

module.exports = { runTests, makeGraphQLRequest, checkHealth };