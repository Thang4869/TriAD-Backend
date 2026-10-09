import type { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { EventBus } from "@shared/domain/event-bus/event-bus";
import { EmailService } from "@shared/services/email.service";
import { BullMqEmailQueue } from "@shared/infrastructure/queue/bullmq-email-queue";

import { CloudinaryImageStorage } from "@core/storage/cloudinary";
import { EnvironmentFeatureFlags } from "@core/feature-flags/environment-feature-flags";
import { PrismaErrorClassifier } from "@core/database/prisma-error-classifier";

import { PrismaProjectionStore } from "@core/outbox/prisma-projection.store";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { PrismaOutboxHandlerTracker } from "@core/outbox/outbox-handler-tracker";
import { OutboxRelay } from "@core/outbox/outbox-relay";

import { OpenTelemetryTracerAdapter } from "@core/observability/opentelemetry-tracer.adapter";
import { PrometheusMetricsAdapter } from "@core/observability/prometheus-metrics.adapter";

export function registerCoreInfrastructure(container: Container): void {
  container.register(TOKENS.EventBus, () => new EventBus());

  container.register(TOKENS.EmailQueue, () => new BullMqEmailQueue());

  container.register(
    TOKENS.EmailService,
    (c) => new EmailService(c.resolve(TOKENS.EmailQueue)),
  );

  container.register(TOKENS.ImageStorage, () => new CloudinaryImageStorage());

  container.register(TOKENS.FeatureFlags, () => new EnvironmentFeatureFlags());

  container.register(
    TOKENS.PersistenceErrorClassifier,
    () => new PrismaErrorClassifier(),
  );

  container.register(TOKENS.Tracer, () => new OpenTelemetryTracerAdapter());

  container.register(TOKENS.Metrics, () => new PrometheusMetricsAdapter());

  container.register(TOKENS.ProjectionStore, () => new PrismaProjectionStore());

  container.register(
    TOKENS.OutboxRelayStore,
    () => new PrismaOutboxRelayStore(),
  );

  container.register(
    TOKENS.HandlerExecutionTracker,
    () => new PrismaOutboxHandlerTracker(),
  );

  container.register(
    TOKENS.OutboxRelay,
    (c) =>
      new OutboxRelay(
        c.resolve(TOKENS.OutboxRelayStore),
        c.resolve(TOKENS.HandlerExecutionTracker),
        c.resolve(TOKENS.EventBus),
      ),
  );
}
