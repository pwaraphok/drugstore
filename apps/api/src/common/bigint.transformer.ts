import { ValueTransformer } from 'typeorm';

export const bigintTransformer: ValueTransformer = {
  to: (value?: string | number | null) => (value == null ? value : value),
  from: (value?: string | number | bigint | null) =>
    value == null ? value : String(value),
};
