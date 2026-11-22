# Cloudhal Helm chart

The chart runs Cloudhal's self-host image on Kubernetes as one installation ([RFC-0047](../../../docs/rfcs/0047-self-host-on-workerd.md)). Each instance runs the release bundle's site and admin Workers on workerd, and the installation's state lives in an S3 store: SeaweedFS in the release by default, or an external store. The [self-host guide](../../../docs/guides/self-host.md) explains the image, the store and the cluster.

```bash
helm install cloudhal oci://ghcr.io/cloudhal-dev/charts/cloudhal --version 0.11.0 \
  --set replicaCount=3 \
  --set baseUrl=https://studio.example.com \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set ingress.studioHost=studio.example.com --set ingress.siteHost=www.example.com
```

From a checkout, use the chart's folder instead: `helm install cloudhal deploy/helm/cloudhal …`.

## What it creates

- **A StatefulSet of `replicaCount` instances.**
  - Each pod advertises `<pod>.<release>-peers` on the cluster port (7000), through a headless Service that resolves before the pods are ready.
  - Probes: `startupProbe` and `livenessProbe` on `/api/health`, `readinessProbe` on `/ready` on the cluster port.
  - Each pod gets a 1 Gi volume for its working copies of the Durable Objects (`persistence`).
  - Pods run non-root with a read-only root filesystem, no capabilities and the `RuntimeDefault` seccomp profile.
- **A Service:** `studio` on 8787 (Studio, the API, `/mcp`) and `site` on 8788. An Ingress or Gateway API `HTTPRoute`s for both hosts can sit in front of it.
- **A Secret, `<release>-cloudhal`:** the site id, the cluster key, the Workers' secrets and the store keys.
  - Generated on install and read back on every upgrade.
  - Kept when the release is deleted (`helm.sh/resource-policy: keep`).
  - To bring your own, set `secrets.existingSecret`. The keys are those of `cloudhal selfhost secrets`.
- **A NetworkPolicy** that admits port 7000 from the release's own pods only. That port grants full control and its traffic is not encrypted.
- **A PodDisruptionBudget** (`maxUnavailable: 1`) when there is more than one instance.
- **SeaweedFS** (`store.enabled`): one pod with a 10 Gi volume. An init container in each Cloudhal pod creates the bucket.

## The first Owner

```bash
kubectl logs cloudhal-0 -c cloudhal | grep setup
```

```bash
kubectl get secret cloudhal -o jsonpath='{.data.CLOUDHAL_SETUP_TOKEN}' | base64 -d
```

Open the logged link with the token in place of `<CLOUDHAL_SETUP_TOKEN>`. Without an Ingress:

```bash
kubectl port-forward svc/cloudhal 8787:8787 8788:8788
```

## An external store

```bash
helm install cloudhal deploy/helm/cloudhal --set store.enabled=false \
  --set external.endpoint=https://s3.eu-central-1.amazonaws.com --set external.region=eu-central-1 \
  --set bucket=my-cloudhal --set secrets.existingSecret=cloudhal-secrets
```

The store must enforce conditional writes. That covers AWS S3, GCS's XML API, R2 and RustFS, but not MinIO's archived community edition or Garage. Give the bucket a lifecycle rule that aborts incomplete multipart uploads.

## Upgrades

```bash
helm upgrade cloudhal deploy/helm/cloudhal --reuse-values --set image.tag=0.11.1
```

Pods are replaced one at a time. A stopping pod hands its objects to the others within 8 s (`terminationGracePeriodSeconds: 30`), and readiness keeps traffic away from a pod until it has joined.
