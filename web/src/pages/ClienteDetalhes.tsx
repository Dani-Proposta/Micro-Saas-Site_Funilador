
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, Badge, Button, Card, Divider, Group, Loader, Stack, Text, Title} from "@mantine/core";

type ProjetoRelacionado = {
  id: string;
  titulo: string;
  status: string;
  arquivadaEm: string | null;
};

type SolicitacaoRelacionada = {
  id: string;
  titulo: string;
  status: string;
};

type ClienteDetalhado = {
  id: string;
  nome: string;
  email: string | null;
  criadoEm: string;
  projetos: ProjetoRelacionado[];
  solicitacoes: SolicitacaoRelacionada[];
};

export function ClienteDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState<ClienteDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function carregarCliente() {
      setCarregando(true);
      setErro(null);

      try {
        if (!id) {
          throw new Error("ID do cliente não informado");
        }

        const resposta = await fetch(`/api/clientes/${id}`, {
          signal: controller.signal,
        });

        if (!resposta.ok) {
          throw new Error("Erro ao buscar cliente");
        }

        const dados: ClienteDetalhado = await resposta.json();
        setCliente(dados);
      } catch (erroRecebido) {
        if (!controller.signal.aborted) {
          console.error(erroRecebido);
          setErro("Não foi possível carregar o cliente");
        }
      } finally {
        if (!controller.signal.aborted) {
          setCarregando(false);
        }
      }
    }

    void carregarCliente();

    return () => controller.abort();
  }, [id]);

  if (carregando) {
    return <Loader size="sm" />;
  }

  if (erro || !cliente) {
    return (
      <Stack>
        <Alert color="red">
          {erro ?? "Cliente não encontrado."}
        </Alert>
        <Button variant="light" onClick={() => navigate("/clientes")}>
          Voltar aos clientes
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Group>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => navigate("/clientes")}
          >
            ← Voltar aos clientes
          </Button>
        </Group>

        <Title order={2} style={{ overflowWrap: "anywhere" }}>
          {cliente.nome}
        </Title>

        <Text c="dimmed" size="sm">
          Ficha individual do cliente
        </Text>
      </Stack>

      <Card withBorder padding="lg">
        <Stack gap="sm">
          <Title order={4}>Cadastro</Title>

          <Text>
            <Text span c="dimmed">E-mail: </Text>
            {cliente.email ?? "Não cadastrado"}
          </Text>

          <Text>
            <Text span c="dimmed">Cliente desde: </Text>
            {new Date(cliente.criadoEm).toLocaleDateString("pt-BR")}
          </Text>
        </Stack>
      </Card>

      <Card withBorder padding="lg">
        <Stack gap="md">
          <Title order={4}>
            Projetos ({cliente.projetos.length})
          </Title>

          {cliente.projetos.length === 0 && (
            <Text c="dimmed" size="sm">
              Este cliente ainda não possui projetos.
            </Text>
          )}

          {cliente.projetos.map((projeto) => (
            <Stack key={projeto.id} gap="sm">
              <Group justify="space-between" align="center">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Text
                    fw={600}
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {projeto.titulo}
                  </Text>

                  <Group gap="xs">
                    <Badge variant="light">
                      {projeto.status.replace("_", " ")}
                    </Badge>

                    {projeto.arquivadaEm && (
                      <Badge color="gray">Arquivado</Badge>
                    )}
                  </Group>
                </Stack>

                <Button
                  size="xs"
                  variant="light"
                  onClick={() =>
                    navigate(`/projetos/${projeto.id}`)
                  }
                >
                  Abrir
                </Button>
              </Group>

              <Divider />
            </Stack>
          ))}
        </Stack>
      </Card>

      <Card withBorder padding="lg">
        <Stack gap="md">
          <Title order={4}>
            Solicitações ({cliente.solicitacoes.length})
          </Title>

          {cliente.solicitacoes.length === 0 && (
            <Text c="dimmed" size="sm">
              Nenhuma solicitação encontrada.
            </Text>
          )}

          {cliente.solicitacoes.map((solicitacao) => (
            <Stack key={solicitacao.id} gap="xs">
              <Group justify="space-between" align="center">
                <Text
                  fw={500}
                  style={{ overflowWrap: "anywhere" }}
                >
                  {solicitacao.titulo}
                </Text>

                <Badge
                  color={
                    solicitacao.status === "aprovada"
                      ? "green"
                      : solicitacao.status === "recusada"
                        ? "red"
                        : "violet"
                  }
                >
                  {solicitacao.status}
                </Badge>
              </Group>

              <Divider />
            </Stack>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
