# fiestime Backend – Serverless Prototype (Phase 1)

This is a serverless backend skeleton for **fiestime**, focused on uploading large pre-recorded soccer match videos from mobile devices to Amazon S3 using **pre-signed URLs** issued via a **GraphQL API** running on **AWS Lambda + API Gateway (HTTP API)**.

## Project Structure

- `package.json` – Node.js dependencies and scripts.
- `tsconfig.json` – TypeScript compiler configuration.
- `cloudformation/template.yaml` – S3 bucket + Lambda + HTTP API stack.
- `docs/` – PRD, how-to, and design docs seeds.
- `src/config/` – environment + AWS SDK configuration.
- `src/graphql/` – schema (SDL) and resolvers.
- `src/handlers/` – Lambda entrypoint for GraphQL.
- `src/local/` – local Express-based dev server.
- `.github/workflows/` – GitHub Actions for sandbox, qa, prod deployments.

## Local Run

```bash
npm install
export AWS_REGION=us-east-1
export UPLOAD_BUCKET=my-fiestime-upload-bucket
export PRESIGNED_URL_TTL_SECONDS=900
npm run start:local
```

- GraphQL endpoint: `http://localhost:4000/graphql`
- Health: `http://localhost:4000/health`

## CI/CD Environments

Three workflows deploy on push to their respective branches:

- `sandbox` → sandbox stack
- `qa` → qa stack
- `prod` → prod stack

Each workflow:

1. Builds TypeScript.
2. Packages `dist`, `node_modules`, `package.json` into a zip.
3. Uploads the zip to an environment-specific S3 code bucket.
4. Runs `aws cloudformation deploy` with appropriate parameters to update the fiestime stack.

Configure the required AWS and bucket/stack details via GitHub repository secrets as indicated in the workflow files.

## Deployment Status

- ✅ **Build Validation**: Passing
- ✅ **AWS Credentials**: Configured and working
- ✅ **S3 Buckets**: Created successfully
- 🚀 **Sandbox Deployment**: Ready for final deployment
