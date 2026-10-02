CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "providerEmail" TEXT NOT NULL,
    "providerEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_accounts_provider_providerSubject_key" ON "oauth_accounts"("provider", "providerSubject");
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
