import apiClient from './apiClient';

export interface Rating {
  _id: string;
  ride: string;
  passenger: { _id: string; name: string } | string;
  driver: string;
  stars: number;
  review?: string;
  createdAt: string;
}

export interface RatingsResponse {
  ratings: Rating[];
  total: number;
}

/**
 * POST /api/ratings
 * Submits a star rating (1–5) and optional review for a completed ride.
 * Passenger only. Duplicate submission is rejected by backend (409).
 */
export async function createRating(payload: {
  rideId: string;
  stars?: number;
  rating?: number;
  review?: string;
  comment?: string;
  targetRole?: string;
}): Promise<Rating> {
  const stars = payload.stars || payload.rating || 5;
  const review = payload.review || payload.comment || '';
  const res = await apiClient.post('/ratings', {
    rideId: payload.rideId,
    stars,
    review,
  });
  return res.data.data.rating as Rating;
}

export const submitRating = createRating;

/**
 * GET /api/ratings/driver/:driverId
 * Public endpoint — no auth required.
 */
export async function getDriverRatings(
  driverId: string,
  params?: { page?: number; limit?: number },
): Promise<RatingsResponse> {
  const res = await apiClient.get(`/ratings/driver/${driverId}`, { params });
  return res.data.data as RatingsResponse;
}
