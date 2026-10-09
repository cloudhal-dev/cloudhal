SELECT blob3 AS path, double2 AS status, blob19 AS redirectTo, blob4 AS nodeId, SUM(double9) AS hits
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZX8K3Q9ST' AND blob1 = 'render'
  AND timestamp >= '2026-10-07T00:00:00Z' AND timestamp < '2026-10-09T00:00:00Z'
  AND double2 >= 300 AND double2 < 400 AND blob19 != ''
GROUP BY blob3, double2, blob19, blob4
ORDER BY hits DESC, blob3 ASC, double2 ASC, blob19 ASC, blob4 ASC
LIMIT 10;
