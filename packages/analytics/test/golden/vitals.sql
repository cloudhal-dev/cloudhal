SELECT
  quantileWeighted(0.75, double3, if(double3 >= 0, toUInt32(double9), 0)) AS lcp_p75,
  sumIf(double9, double3 >= 0) AS lcp_samples,
  sumIf(double9, double3 >= 0 AND double3 <= 2500) AS lcp_good,
  sumIf(double9, double3 > 4000) AS lcp_poor,
  quantileWeighted(0.75, double4, if(double4 >= 0, toUInt32(double9), 0)) AS inp_p75,
  sumIf(double9, double4 >= 0) AS inp_samples,
  sumIf(double9, double4 >= 0 AND double4 <= 200) AS inp_good,
  sumIf(double9, double4 > 500) AS inp_poor,
  quantileWeighted(0.75, double5, if(double5 >= 0, toUInt32(double9), 0)) AS cls_p75,
  sumIf(double9, double5 >= 0) AS cls_samples,
  sumIf(double9, double5 >= 0 AND double5 <= 100) AS cls_good,
  sumIf(double9, double5 > 250) AS cls_poor,
  quantileWeighted(0.75, double6, if(double6 >= 0, toUInt32(double9), 0)) AS ttfb_p75,
  sumIf(double9, double6 >= 0) AS ttfb_samples,
  sumIf(double9, double6 >= 0 AND double6 <= 800) AS ttfb_good,
  sumIf(double9, double6 > 1800) AS ttfb_poor,
  quantileWeighted(0.75, double7, if(double7 >= 0, toUInt32(double9), 0)) AS fcp_p75,
  sumIf(double9, double7 >= 0) AS fcp_samples,
  sumIf(double9, double7 >= 0 AND double7 <= 1800) AS fcp_good,
  sumIf(double9, double7 > 3000) AS fcp_poor
FROM events.analyticsEngine."newsroom_events"
WHERE index1 = 'site_01HZX8K3Q9ST' AND blob1 = 'vitals'
  AND timestamp >= '2026-10-07T00:00:00Z' AND timestamp < '2026-10-09T00:00:00Z';
