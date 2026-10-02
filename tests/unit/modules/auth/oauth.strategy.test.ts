import { describe, expect, it } from "vitest";
import {
  mapFacebookProfile,
  mapGoogleProfile,
} from "@modules/auth/strategies/oauth2.strategy";

describe("OAuth profile mapping", () => {
  it("maps a verified Google profile to provider identity", () => {
    const identity = mapGoogleProfile({
      id: "google-subject",
      emails: [{ value: " User@Example.com ", verified: true }],
      name: { givenName: "Ada", familyName: "Lovelace" },
    } as any);

    expect(identity).toEqual({
      provider: "GOOGLE",
      subject: "google-subject",
      email: "user@example.com",
      emailVerified: true,
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("does not invent Facebook email verification", () => {
    const identity = mapFacebookProfile({
      id: "facebook-subject",
      emails: [{ value: "user@example.com" }],
      name: { givenName: "Grace", familyName: "Hopper" },
    } as any);

    expect(identity.provider).toBe("FACEBOOK");
    expect(identity.subject).toBe("facebook-subject");
    expect(identity.emailVerified).toBe(false);
  });

  it.each([
    { id: "", emails: [{ value: "user@example.com", verified: true }] },
    { id: "subject", emails: [] },
  ])("rejects an incomplete Google profile", (profile) => {
    expect(() => mapGoogleProfile(profile as any)).toThrow(
      "OAuth identity is incomplete",
    );
  });

  it.each([
    { id: "", emails: [{ value: "user@example.com" }] },
    { id: "subject", emails: [] },
  ])("rejects an incomplete Facebook profile", (profile) => {
    expect(() => mapFacebookProfile(profile as any)).toThrow(
      "OAuth identity is incomplete",
    );
  });
});
