SELECT blob3, double2, blob20, SUM(double9) AS hits, APPROX_MAX(timestamp) AS lastSeen
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZX8K3Q9ST' AND blob1 = 'render'
  AND timestamp >= '2026-10-07T00:00:00Z' AND timestamp < '2026-10-09T00:00:00Z'
  AND double2 >= 400
GROUP BY blob3, double2, blob20
ORDER BY hits DESC, blob3 ASC, double2 ASC, blob20 ASC
LIMIT 10;
