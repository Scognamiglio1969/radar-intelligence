export type RawReview = {
  externalId: string;
  rating: number;       // 1-5
  title?: string;
  content: string;
  author?: string;
  url?: string;
  publishedAt: Date;
};
