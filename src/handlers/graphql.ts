import { ApolloServer } from "@apollo/server";
import { startServerAndCreateLambdaHandler, handlers } from "@as-integrations/aws-lambda";
import { typeDefs } from "../graphql/schema";
import { resolvers } from "../graphql/resolvers";
import { initializeDatabase } from "../db/mongo";
import { AppError } from "../models/Error";
import { loadEnv } from "../config/env";

const env = loadEnv();

// Custom error formatter for GraphQL
const formatError = (error: any) => {
  // Log error for debugging
  console.error('GraphQL Error:', {
    message: error.message,
    locations: error.locations,
    path: error.path,
    stack: error.stack
  });

  // If it's our custom AppError, format it properly
  if (error.originalError instanceof AppError) {
    const appError = error.originalError as AppError;
    return {
      message: appError.message,
      code: appError.code,
      path: error.path,
      extensions: {
        details: appError.details,
        timestamp: appError.timestamp,
        requestId: appError.requestId,
        statusCode: appError.statusCode
      }
    };
  }

  // For other errors, return a generic message in production
  if (env.NODE_ENV === 'production') {
    return {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      path: error.path,
      extensions: {
        timestamp: new Date().toISOString()
      }
    };
  }

  // In development, return the full error
  return {
    message: error.message,
    code: 'INTERNAL_ERROR',
    path: error.path,
    extensions: {
      timestamp: new Date().toISOString(),
      stack: error.stack
    }
  };
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError,
  introspection: env.NODE_ENV !== 'production',
  plugins: [
    {
      // Plugin to initialize database on server start
      async serverWillStart() {
        return {
          async drainServer() {
            // Optional: close database connections on shutdown
          }
        };
      },
      // Plugin to add request ID to context
      async requestDidStart() {
        return {
          async willSendResponse(requestContext: any) {
            // Add custom headers
            if (requestContext.response.http) {
              requestContext.response.http.headers.set('X-Environment', env.NODE_ENV);
              requestContext.response.http.headers.set('X-Request-ID', requestContext.request.http?.headers.get('x-request-id') || 'unknown');
              requestContext.response.http.headers.set('X-Response-Time', Date.now().toString());
            }
          }
        };
      }
    }
  ]
});

// Initialize database when handler is first loaded
let dbInitialized = false;
const initDb = async () => {
  if (!dbInitialized && env.NODE_ENV !== 'test') {
    try {
      await initializeDatabase();
      dbInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      // Don't throw here - let individual requests handle DB errors
    }
  }
};

export const graphqlHandler = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  {
    middleware: [
      // Initialize database before processing requests
      async (event: any) => {
        await initDb();
        return event;
      }
    ]
  }
);
