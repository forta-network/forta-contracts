# Forta Subgraph

We use a [blue/green deployment](https://www.redhat.com/en/topics/devops/what-is-blue-green-deployment) pattern with our production subgraph instances. This allows use to more safely role out new features and have an option to easily role back the UI if needed.

Blue deployment: https://thegraph.com/hosted-service/subgraph/forta-network/forta-network-a

Green deployment: https://thegraph.com/hosted-service/subgraph/forta-network/forta-network-b