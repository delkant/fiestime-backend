import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { typeDefs } from "../graphql/schema";
import { resolvers } from "../graphql/resolvers";
import { initializeDatabase, checkDatabaseHealth, closeConnection } from "../db/mongo";
import { loadEnv } from "../config/env";
import { AppError } from "../models/Error";

const PORT = Number(process.env.PORT || 4000);
const env = loadEnv();

// Custom error formatter for development
const formatError = (error: any) => {
  console.error('GraphQL Error:', {
    message: error.message,
    locations: error.locations,
    path: error.path,
    stack: error.stack
  });

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

  return {
    message: error.message,
    code: 'INTERNAL_ERROR',
    path: error.path,
    extensions: {
      timestamp: new Date().toISOString(),
      stack: env.NODE_ENV === 'development' ? error.stack : undefined
    }
  };
};

async function main() {
  const app = express();
  const httpServer = http.createServer(app);

  console.log('Starting fiestime local development server...');

  try {
    // Initialize database connection and indexes
    console.log('Initializing database connection...');
    await initializeDatabase();
    console.log('Database initialized successfully');

    // Test database health
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }
    console.log('Database health check passed');

  } catch (error) {
    console.error('Failed to initialize database:', error);
    console.log('Continuing without database - some features may not work');
  }

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    formatError,
    introspection: true, // Always enabled in development
    plugins: [
      {
        async requestDidStart() {
          return {
            async willSendResponse(requestContext: any) {
              // Add development headers
              if (requestContext.response.http) {
                requestContext.response.http.headers.set('X-Environment', 'development');
                requestContext.response.http.headers.set('X-Request-ID', 'dev-' + Date.now());
                requestContext.response.http.headers.set('X-Response-Time', Date.now().toString());
              }
            }
          };
        }
      }
    ]
  });

  await server.start();

  // CORS configuration for development
  const corsOptions = {
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
    credentials: true
  };

  app.use(
    "/graphql",
    cors(corsOptions),
    bodyParser.json({ limit: '50mb' }), // Increased limit for large payloads
    expressMiddleware(server)
  );

  // Health endpoint with database status
  app.get("/health", async (_req, res) => {
    try {
      const dbHealth = await checkDatabaseHealth();
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        environment: "development",
        database: dbHealth ? "connected" : "disconnected"
      });
    } catch (error) {
      res.status(503).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
        database: "error"
      });
    }
  });

  // Add a simple API info endpoint
  app.get("/", (_req, res) => {
    res.json({
      name: "fiestime Backend API",
      version: "1.0.0",
      environment: "development",
      graphql: `http://localhost:${PORT}/graphql`,
      health: `http://localhost:${PORT}/health`,
      timestamp: new Date().toISOString()
    });
  });

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    await closeConnection();
    httpServer.close(() => {
      console.log('Server shut down');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    await closeConnection();
    httpServer.close(() => {
      console.log('Server shut down');
      process.exit(0);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));

  console.log('✅ fiestime local development server started successfully!');
  console.log(`📍 GraphQL Playground: http://localhost:${PORT}/graphql`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`📊 API Info: http://localhost:${PORT}/`);
  console.log('');
  console.log('Environment variables:');
  console.log(`  NODE_ENV: ${env.NODE_ENV}`);
  console.log(`  AWS_REGION: ${env.AWS_REGION}`);
  console.log(`  UPLOAD_BUCKET: ${env.UPLOAD_BUCKET}`);
  console.log(`  MONGODB_URI: ${env.MONGODB_URI ? '***configured***' : 'not set'}`);
  console.log(`  MONGODB_URI_SECRET_NAME: ${env.MONGODB_URI_SECRET_NAME || 'not set'}`);
}

main().catch((err) => {
  console.error("❌ Failed to start local dev server:", err);
  process.exit(1);
});
