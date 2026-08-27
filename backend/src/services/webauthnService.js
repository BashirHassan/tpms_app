/**
 * WebAuthn Service
 *
 * Thin wrapper around @simplewebauthn/server for platform-authenticator
 * (Android/Windows/Mac built-in fingerprint or face) enrollment and
 * assertion, used to gate supervisor location check-ins.
 *
 * RP ID must be a registrable domain that is a suffix of every origin the
 * ceremony runs on. In production every tenant lives on a subdomain of the
 * same base domain, so the base domain itself is used as the RP ID - a
 * credential registered on demo.sitpms.com is then valid on any *.sitpms.com
 * tenant. In local dev, fall back to whichever local domain the request
 * actually came in on.
 */

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const config = require('../config');

/**
 * Resolve { rpID, rpName, origin } for the current request.
 * @param {Object} req - Express request object
 */
function getWebAuthnConfig(req) {
  const origin = req.headers.origin;
  let hostname = null;
  try {
    hostname = origin ? new URL(origin).hostname : null;
  } catch {
    hostname = null;
  }

  const baseDomain = config.multiTenant.baseDomain;
  const localDomains = config.localDev.localDomains || [];

  let rpID = baseDomain;
  if (hostname) {
    if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)) {
      rpID = baseDomain;
    } else {
      const matchedLocalDomain = localDomains.find(
        (d) => hostname === d || hostname.endsWith(`.${d}`)
      );
      if (matchedLocalDomain) {
        rpID = matchedLocalDomain;
      } else if (config.isDevelopment) {
        // Unrecognized dev host (e.g. a raw IP) - best effort, use as-is.
        rpID = hostname;
      }
    }
  }

  return {
    rpID,
    rpName: 'DigitalTP',
    origin: origin || `https://${rpID}`,
  };
}

function userIdToHandle(userId) {
  return new TextEncoder().encode(String(userId));
}

async function buildRegistrationOptions(req, { userId, userName, excludeCredentials }) {
  const { rpID, rpName } = getWebAuthnConfig(req);

  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: userIdToHandle(userId),
    userName,
    attestationType: 'none',
    excludeCredentials: excludeCredentials.map((cred) => ({
      id: cred.credential_id,
      transports: cred.transports || undefined,
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'discouraged',
    },
  });
}

async function verifyRegistration(req, { response, expectedChallenge }) {
  const { rpID, origin } = getWebAuthnConfig(req);

  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
}

async function buildAuthenticationOptions(req, { allowCredentials }) {
  const { rpID } = getWebAuthnConfig(req);

  return generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: allowCredentials.map((cred) => ({
      id: cred.credential_id,
      transports: cred.transports || undefined,
    })),
  });
}

async function verifyAuthentication(req, { response, expectedChallenge, credential }) {
  const { rpID, origin } = getWebAuthnConfig(req);

  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.credential_id,
      publicKey: Buffer.from(credential.public_key, 'base64'),
      counter: Number(credential.counter),
      transports: credential.transports || undefined,
    },
    requireUserVerification: true,
  });
}

module.exports = {
  getWebAuthnConfig,
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyAuthentication,
};
