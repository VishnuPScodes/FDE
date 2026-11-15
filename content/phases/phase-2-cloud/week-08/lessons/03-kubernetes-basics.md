# Run apps on Kubernetes

Imagine a food delivery app on the night of IPL final. Traffic jumps ten times. One server cannot cope, and you cannot sit there starting copies by hand. Kubernetes is a manager that does this for you. You tell it what you want. It keeps making the cluster match, even when machines or programs fail.

The smallest unit is a pod: one or more containers that run together. You rarely make pods yourself. You write a Deployment, which says "keep three copies of this image running". If a pod dies, the Deployment starts another. You describe it in a YAML file and send it with kubectl apply -f.

    kubectl apply -f deployment.yaml
    kubectl get pods

Pods come and go, and each new pod gets a new address. A Service gives them one steady name. It finds pods by labels. If the labels in the Service do not match the labels on the pods, you get no endpoints and no traffic. An Ingress sits in front and sends web requests to the right Service by host name and path.

Settings live outside the image. A ConfigMap holds plain settings. A Secret holds passwords. Pods read them as environment variables, so one image runs in every environment.

When something is wrong, read before you guess. kubectl get pods shows the status. kubectl describe pod shows the events, such as "Insufficient cpu" or "ImagePullBackOff". kubectl logs shows what the program printed before it crashed.

A new release is a rolling update. Kubernetes starts new pods and stops old ones in small steps. If the new pods never become ready, the old ones keep serving. Run kubectl rollout status to watch, and kubectl rollout undo to go back.

The cluster in this level is a small simulation. It runs in your browser and cannot touch any real machine.
