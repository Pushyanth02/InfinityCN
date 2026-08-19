/** Minimal structural file type so ingestion can be unit-tested with fakes. */
export interface Fileish {
  name: string;
  size: number;
  type: string;
}
