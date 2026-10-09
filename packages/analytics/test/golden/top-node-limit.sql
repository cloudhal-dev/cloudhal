SELECT blob4 AS key, COUNT(*) AS pageviews, SUM(double1) AS visits
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZX8K3Q9ST' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-07T00:00:00Z' AND timestamp < '2026-10-09T00:00:00Z'
  AND blob4 != ''
GROUP BY blob4
ORDER BY pageviews DESC, blob4 ASC
LIMIT 2;
