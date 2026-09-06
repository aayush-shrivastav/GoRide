const { estimateFare } = require("../src/services/fareService");

describe("fareService.estimateFare", () => {
  it("calculates a fare above the minimum for a normal trip", () => {
    const fare = estimateFare({ vehicleType: "car", distanceKm: 10, durationMin: 20 });
    expect(fare.totalFare).toBeGreaterThan(0);
    expect(fare.currency).toBe("INR");
  });

  it("enforces the minimum fare for very short trips", () => {
    const fare = estimateFare({ vehicleType: "car", distanceKm: 0.1, durationMin: 1 });
    expect(fare.totalFare).toBeGreaterThanOrEqual(50); // car minimumFare
  });

  it("throws for an unsupported vehicle type", () => {
    expect(() => estimateFare({ vehicleType: "helicopter", distanceKm: 5, durationMin: 5 })).toThrow();
  });
});
