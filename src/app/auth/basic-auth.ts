export const BASIC_AUTH_REALM = "automation-server-net3";

export function decodeBasicCredentials(
  authorizationHeader: string,
): {
  username: string;
  password: string;
} | null {
  const [scheme, encodedCredentials] = authorizationHeader.split(" ");

  if (scheme !== "Basic" || !encodedCredentials) {
    return null;
  }

  const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString("utf-8");
  const separatorIndex = decodedCredentials.indexOf(":");

  if (separatorIndex < 0) {
    return null;
  }

  return {
    username: decodedCredentials.slice(0, separatorIndex),
    password: decodedCredentials.slice(separatorIndex + 1),
  };
}

export function hasValidBasicAuth(
  authorizationHeader: string | undefined,
  expectedUsername: string,
  expectedPassword: string,
): boolean {
  if (!authorizationHeader) {
    return false;
  }

  const credentials = decodeBasicCredentials(authorizationHeader);

  return (
    credentials !== null &&
    credentials.username === expectedUsername &&
    credentials.password === expectedPassword
  );
}

export function buildBasicAuthChallengeHeader(realm = BASIC_AUTH_REALM): string {
  return `Basic realm="${realm}"`;
}
