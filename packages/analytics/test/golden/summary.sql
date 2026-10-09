SELECT COUNT(*) AS pageviews, SUM(double1) AS visits, countIf(blob15 != '') AS hashed
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZX8K3Q9ST' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-07T00:00:00Z' AND timestamp < '2026-10-09T00:00:00Z';

-- visitors (only when hashed > 0)
SELECT toStartOfDay(timestamp) AS day, COUNT(DISTINCT blob15) AS visitors
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZX8K3Q9ST' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-07T00:00:00Z' AND timestamp < '2026-10-09T00:00:00Z'
  AND blob15 != ''
GROUP BY day
ORDER BY day;
