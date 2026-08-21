import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TriAD E-Commerce API",
      version: "1.0.0",
      description: "Complete API for TriAD Kitchenware E-Commerce Platform",
      contact: {
        name: "TriAD Support",
        email: "TriAD@shop.vn",
      },
    },
    servers: [
      {
        url: process.env.API_URL || "http://localhost:5000",
        description: "API Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/modules/**/*.ts", "./src/shared/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
