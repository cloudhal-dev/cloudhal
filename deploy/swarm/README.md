# Cloudhal on Docker Swarm

[`stack.yml`](stack.yml) runs several instances of the self-host image as one installation, with SeaweedFS as the store ([RFC-0047](../../docs/rfcs/0047-self-host-on-workerd.md)). The [self-host guide](../../docs/guides/self-host.md) explains the image, the store and the cluster.

1. **Secrets:** once per installation, create every value as a Docker secret:

   ```bash
   docker run --rm ghcr.io/cloudhal-dev/cloudhal:latest secrets | deploy/swarm/create-secrets.sh
   ```

   Keep a copy of that output somewhere safe as well. `cloudhal_site_id` and `cloudhal_cluster_key` must never change, so the script refuses to replace a secret that already exists.
2. **Store node:** label the node that keeps SeaweedFS's volume:

   ```bash
   docker node update --label-add cloudhal.store=true <node>
   ```

3. **Deploy:**

   ```bash
   docker stack deploy -c deploy/swarm/stack.yml cloudhal
   ```

   The stack runs two replicas by default; `CLOUDHAL_REPLICAS=3 docker stack deploy …` gives more. Studio is on port 8787 of every node and the site on 8788. The setup link is in `docker service logs cloudhal_cloudhal`; `docker secret` cannot show the token, so take it from the saved output of step 1.
4. **Upgrade:**

   ```bash
   CLOUDHAL_TAG=0.11.1 docker stack deploy -c deploy/swarm/stack.yml cloudhal
   ```

   One task is replaced at a time, and each new task starts before the old one stops (`start-first`). A stopping task hands its objects to its peers within 8 s.

**Notes:**

- **Peer traffic** (port 7000) travels on the stack's own overlay, `10.231.0.0/24`, which is `encrypted`. Each task advertises its address there (`CLOUDHAL_CLUSTER_ADVERTISE=auto:10.231.0.0/24`). If that subnet is taken in your swarm, change it in both places.
- **Working copies:** each task's `/data` is a volume named `cloudhal-data-<slot>` on the node it runs on. It holds only working copies; the store holds the installation, so back up the `cloudhal-store` volume (guide, "Backup and restore").
- **TLS:** put a TLS proxy or load balancer in front of ports 8787 and 8788. It must append the client's address to `X-Forwarded-For`. Then set `CLOUDHAL_BASE_URL` and `CLOUDHAL_BEHIND_PROXY=1` when you deploy. The routing mesh hides the client's address, so without a proxy rate limits share one bucket per path.
- **External store:** to use an external S3 store, set `CLOUDHAL_S3_ENDPOINT` and the bucket, put its keys in the two `cloudhal_aws_*` secrets, and remove the `seaweedfs` service.
