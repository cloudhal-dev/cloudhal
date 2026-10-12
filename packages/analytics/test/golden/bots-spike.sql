SELECT toStartOfHour(timestamp) AS t, COUNT(*) AS pageviews, SUM(double1) AS visits
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZXBOTLIKE1' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-05T13:00:00Z' AND timestamp < '2026-10-12T13:00:00Z'
GROUP BY t
ORDER BY t;

SELECT blob7, COUNT(*) AS pageviews, SUM(double1) AS visits
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZXBOTLIKE1' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-11T03:00:00Z' AND timestamp < '2026-10-11T04:00:00Z'
  AND blob7 != ''
GROUP BY blob7
ORDER BY pageviews DESC, blob7 ASC
LIMIT 10;

SELECT blob13, COUNT(*) AS pageviews, SUM(double1) AS visits
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZXBOTLIKE1' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-11T03:00:00Z' AND timestamp < '2026-10-11T04:00:00Z'
  AND blob13 != ''
GROUP BY blob13
ORDER BY pageviews DESC, blob13 ASC
LIMIT 1;

SELECT blob4, COUNT(*) AS pageviews, SUM(double1) AS visits
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZXBOTLIKE1' AND blob1 = 'pageview'
  AND timestamp >= '2026-10-11T03:00:00Z' AND timestamp < '2026-10-11T04:00:00Z'
  AND blob4 != ''
GROUP BY blob4
ORDER BY pageviews DESC, blob4 ASC
LIMIT 1;
