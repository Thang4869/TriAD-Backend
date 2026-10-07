export type TraceAttributeValue = string | number | boolean;

export type TraceAttributes = Record<string, TraceAttributeValue>;

export type TraceAttributeSetter = (attributes: TraceAttributes) => void;

export interface TracerPort {
  withSpan<T>(
    name: string,
    operation: (setAttributes: TraceAttributeSetter) => Promise<T>,
    attributes?: TraceAttributes,
  ): Promise<T>;
}
