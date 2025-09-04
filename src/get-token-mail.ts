// get-token.js
import readline from "readline";
import open from "open";
import { AuthorizationCode } from "simple-oauth2";
import dotenv from "dotenv";

dotenv.config();

const AZURE_TENANT_ID: string = process.env.AZURE_TENANT_ID as string;
console.log`Azure Tenant ID: ${AZURE_TENANT_ID}`;
const AZURE_CLIENT_ID: string = process.env.AZURE_CLIENT_ID as string;
const AZURE_CLIENT_SECRET: string = process.env.AZURE_CLIENT_SECRET as string;

const config = {
  client: {
    id: AZURE_CLIENT_ID,
    secret: AZURE_CLIENT_SECRET,
  },
  auth: {
    tokenHost: "https://login.microsoftonline.com",
    authorizePath: `/${AZURE_TENANT_ID}/oauth2/v2.0/authorize`,
    tokenPath: `/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
  },
};

console.log("Config:", config);

const client = new AuthorizationCode(config);

const authorizationUri = client.authorizeURL({
  redirect_uri: "http://localhost",
  scope: "https://graph.microsoft.com/.default offline_access",
});

console.log("Opening browser for auth...");
open(authorizationUri);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Enter the code from the URL: ", async (code) => {
  const tokenParams = {
    code,
    redirect_uri: "http://localhost",
    scope: "https://graph.microsoft.com/.default offline_access",
  };

  try {
    const accessToken = await client.getToken(tokenParams);
    console.log("Access Token:", accessToken.token);
  } catch (error: any) {
    console.error("Access Token Error", error.message);
  }
  rl.close();
});
