// get-token.ts
import readline from "readline";
import open from "open";
import { AuthorizationCode } from "simple-oauth2";

const config = {
  client: {
    id: "YOUR_CLIENT_ID",
    secret: "YOUR_CLIENT_SECRET",
  },
  auth: {
    tokenHost: "https://login.microsoftonline.com",
    authorizePath: "/YOUR_TENANT_ID/oauth2/v2.0/authorize",
    tokenPath: "/YOUR_TENANT_ID/oauth2/v2.0/token",
  },
};

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
