/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-must-not-depend-on-infrastructure",
      severity: "error",
      comment:
        "Domain code must remain independent from infrastructure adapters.",
      from: {
        path: "^src/(modules/[^/]+/domain|shared/domain)/",
      },
      to: {
        path: "^src/modules/[^/]+/infrastructure/",
      },
    },
    {
      name: "domain-must-not-depend-on-application",
      severity: "error",
      comment: "Domain code must not depend on the application layer.",
      from: {
        path: "^src/(modules/[^/]+/domain|shared/domain)/",
      },
      to: {
        path: "^src/modules/[^/]+/application/",
      },
    },
    {
      name: "domain-must-not-depend-on-core",
      severity: "error",
      comment: "Domain code must not depend on concrete core infrastructure.",
      from: {
        path: "^src/(modules/[^/]+/domain|shared/domain)/",
      },
      to: {
        path: "^src/core/",
      },
    },
    {
      name: "application-must-not-depend-on-infrastructure",
      severity: "error",
      comment:
        "Application code must depend on ports, not infrastructure adapters.",
      from: {
        path: "^src/modules/[^/]+/application/",
      },
      to: {
        path: "^src/modules/[^/]+/infrastructure/",
      },
    },
    {
      name: "services-must-not-depend-on-infrastructure",
      severity: "error",
      comment:
        "Application services must depend on ports, not infrastructure adapters.",
      from: {
        path: "^src/modules/(?:.+\\.service\\.ts|.+/services/)",
      },
      to: {
        path: "^src/modules/.+/infrastructure/",
      },
    },
    {
      name: "application-must-not-depend-on-core-infrastructure",
      severity: "error",
      comment:
        "Application services must not depend on concrete database, storage, queue, outbox, Redis, DI, health, or feature-flag adapters.",
      from: {
        path: "^src/modules/(?:[^/]+/application/|[^/]+/[^/]+\\.service\\.ts$|[^/]+/services/)",
      },
      to: {
        path: "^src/core/(database|storage|outbox|redis|queue|di|health|feature-flags)/",
      },
    },
  ],

  options: {
    tsConfig: {
      fileName: "tsconfig.json",
    },

    doNotFollow: {
      path: "node_modules",
    },

    exclude: {
      path: "^(tests|scripts|dist)/",
    },
  },
};
