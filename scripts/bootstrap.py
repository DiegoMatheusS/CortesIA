from pathlib import Path
import secrets,os
root=Path(__file__).resolve().parents[1];env=root/'.env'
if env.exists():raise SystemExit('.env já existe; não sobrescrevi seus segredos.')
env.write_text('\n'.join(f'{k}={secrets.token_hex(32)}' for k in ['POSTGRES_PASSWORD','CPF_HMAC_KEY','WORKER_TOKEN'])+'\n')
os.chmod(env,0o600)
script=root/'cortes-ia-infra/local/init-aws.sh';script.chmod(0o755)
print('Configuração local criada. Execute: docker compose up --build')
