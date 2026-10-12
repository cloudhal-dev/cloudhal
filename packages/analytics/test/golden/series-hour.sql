SELECT toStartOfHour(timestamp) AS t, COUNT(*) AS pageviews, SUM(double1) AS visits
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZX8K3Q9ST' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-07T08:00:00Z' AND timestamp < '2026-10-07T11:00:00Z'
GROUP BY t
ORDER BY t;
