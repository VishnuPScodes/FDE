/** Known command phrases per simulated terminal, used for Tab completion. */

export const GIT_COMMANDS = [
  'git status', 'git add', 'git add .', 'git commit -m', 'git log', 'git log --oneline', 'git diff', 'git diff --staged',
  'git branch', 'git checkout', 'git checkout -b', 'git switch', 'git switch -c', 'git merge', 'git rebase', 'git reset',
  'git stash', 'git stash pop', 'git restore', 'git revert', 'git cherry-pick', 'git tag', 'git remote', 'git remote -v',
  'git fetch', 'git pull', 'git push', 'git push -u origin', 'git clone', 'git init', 'git show', 'git reflog', 'git blame', 'git rm', 'git mv',
];

export const DOCKER_COMMANDS = [
  'docker build', 'docker build -t', 'docker run', 'docker run -d', 'docker run --rm', 'docker ps', 'docker ps -a', 'docker images',
  'docker pull', 'docker push', 'docker tag', 'docker stop', 'docker start', 'docker rm', 'docker rmi', 'docker logs', 'docker exec',
  'docker inspect', 'docker network ls', 'docker network create', 'docker volume ls', 'docker volume create', 'docker compose up',
  'docker compose down', 'docker compose ps', 'docker compose logs', 'docker history', 'docker scan', 'docker system prune',
];

export const CI_COMMANDS = ['push main', 'push', 'pr', 'tag', 'dispatch', 'run', 'status', 'help', 'clear'];

export const TERRAFORM_COMMANDS = [
  'terraform init', 'terraform validate', 'terraform fmt', 'terraform plan', 'terraform apply', 'terraform apply -auto-approve',
  'terraform destroy', 'terraform show', 'terraform output', 'terraform state list', 'terraform state show', 'terraform state rm',
  'terraform import', 'terraform workspace list', 'terraform workspace new', 'terraform workspace select', 'terraform taint', 'terraform refresh',
  'ls', 'cat', 'help', 'clear',
];

export const KUBERNETES_COMMANDS = [
  'kubectl get pods', 'kubectl get deployments', 'kubectl get services', 'kubectl get nodes', 'kubectl get namespaces', 'kubectl get all',
  'kubectl get configmaps', 'kubectl get secrets', 'kubectl get ingress', 'kubectl get events',
  'kubectl describe pod', 'kubectl describe deployment', 'kubectl describe service', 'kubectl apply -f', 'kubectl delete -f', 'kubectl delete pod',
  'kubectl logs', 'kubectl exec', 'kubectl scale deployment', 'kubectl rollout status', 'kubectl rollout undo', 'kubectl rollout restart',
  'kubectl expose deployment', 'kubectl port-forward', 'kubectl config', 'kubectl create', 'kubectl label', 'kubectl top pods',
  'ls', 'cat', 'help', 'clear',
];

export const AWS_COMMANDS = [
  'aws s3 ls', 'aws s3 mb', 'aws s3 cp', 'aws s3 rm', 'aws s3 sync', 'aws s3api', 'aws ec2 describe-instances', 'aws ec2 run-instances',
  'aws ec2 describe-security-groups', 'aws ec2 describe-vpcs', 'aws iam list-users', 'aws iam list-roles', 'aws iam get-role', 'aws iam create-role',
  'aws sts get-caller-identity', 'aws lambda list-functions', 'aws lambda invoke', 'aws rds describe-db-instances', 'aws logs describe-log-groups',
  'aws cloudwatch describe-alarms', 'aws sqs list-queues', 'aws sns list-topics', 'aws dynamodb list-tables', 'aws configure', 'aws help', 'clear',
];
