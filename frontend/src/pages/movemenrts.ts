export type MovementType = 'IN' | 'OUT' | 'ADJUST' | 'SET';

export type StockMovement = {
  id: number;
  productId: number;
  type: MovementType;
  delta: number;
  before: number;
  after: number;
  reason?: string | null;
  source?: string | null;
  actor?: string | null;
  createdAt: string;
};

export type MovementsResp = {
  items: StockMovement[];
  page: number;
  pageSize: number;
  total: number;
};
