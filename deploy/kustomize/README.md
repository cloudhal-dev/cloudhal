# Cloudhal with kustomize

[`base/`](base) contains the Helm chart's defaults rendered as plain manifests ([RFC-0047](../../docs/rfcs/0047-self-host-on-workerd.md)), for clusters that use kustomize instead of Helm:

- a StatefulSet with one instance;
- SeaweedFS as the store;
- the Services, including the headless peers Service;
- the NetworkPolicy that guards the cluster port.

`scripts/kustomize-base.sh` regenerates `cloudhal.yaml` from `deploy/helm/cloudhal`, and CI fails when the two differ. The chart's README describes every part.

1. **Secrets, once:** generate them into the base folder and never commit them. `CLOUDHAL_SITE_ID` and `CLOUDHAL_CLUSTER_KEY` must never change.

   ```bash
   docker run --rm ghcr.io/cloudhal-dev/cloudhal:latest secrets | grep -v '^#' > deploy/kustomize/base/secrets.env
   ```

2. **An overlay:** for example `overlays/production/kustomization.yaml`:

   ```yaml
   apiVersion: kustomize.config.k8s.io/v1beta1
   kind: Kustomization
   namespace: cloudhal
   resources: [../../base]
   images:
     - name: ghcr.io/cloudhal-dev/cloudhal
       newTag: "0.11.0"
   replicas:
     - name: cloudhal
       count: 3
   patches:
     - target: { kind: StatefulSet, name: cloudhal }
       patch: |
         - op: add
           path: /spec/template/spec/containers/0/env/-
           value: { name: CLOUDHAL_BASE_URL, value: https://studio.example.com }
         - op: add
           path: /spec/template/spec/containers/0/env/-
           value: { name: CLOUDHAL_BEHIND_PROXY, value: "1" }
   ```

   Add an Ingress or `HTTPRoute`s for the `cloudhal` Service: `studio` on 8787 and `site` on 8788.

3. **Apply:**

   ```bash
   kubectl apply -k deploy/kustomize/overlays/production
   ```

The base sets `CLOUDHAL_BASE_URL` empty and `CLOUDHAL_BEHIND_PROXY=0`. The patches above override them, and the later entry wins.
