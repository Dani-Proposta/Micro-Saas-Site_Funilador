import { GerenciarAcesso } from "../components/GerenciarAcesso";
import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";

import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { caminhoMensagens, destinoRetorno, registrarOrigem, estadoRetorno } from "../lib/navegacaoContextual";
import { Alert, Badge, Button, Card, Divider, Group, Stack, Text, Title, Modal, TextInput } from "@mantine/core";

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
  const location = useLocation();
  const voltarPara = destinoRetorno(location.state, "/clientes");
  const origemAnterior = estadoRetorno(location.state)?.estadoAnterior;
  const rotuloVoltar = voltarPara.startsWith("/projetos/") ? "Voltar ao projeto" : "Voltar aos clientes";

  const [cliente, setCliente] = useState<ClienteDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [emailEdicao, setEmailEdicao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

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

  function abrirEdicao() {
      if (!cliente) return;

      setNomeEdicao(cliente.nome);
      setEmailEdicao(cliente.email ?? "");
      setErroEdicao(null);
      setEditando(true);
  }

  async function salvarEdicao() {
      if (!cliente || salvando) return;

      if (!nomeEdicao.trim()) {
          setErroEdicao("O nome do cliente é obrigatório");
          return;
      }

      setSalvando(true);
      setErroEdicao(null);

      try {
          const resposta = await fetch(`/api/clientes/${cliente.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nome: nomeEdicao.trim(), email: emailEdicao.trim() }),
          });

          if (!resposta.ok) {
              throw new Error("Erro ao editar cliente");
          }

          const dados: Pick<ClienteDetalhado, "id" | "nome" | "email"> = await resposta.json();

          setCliente((anterior) => anterior ? { ...anterior, nome: dados.nome, email: dados.email } : anterior);
          setEditando(false);

      } catch (erro) {
          console.error(erro);
          setErroEdicao("Não foi possível salvar as alterações");
      } finally {
          setSalvando(false);
      }
  }




  if (carregando) {
    return <Carregamento tipo="detalhes" quantidade={3}/>;
  }

  if (erro || !cliente) {
    return (
      <Stack>
        <Alert color="red">
          {erro ?? "Cliente não encontrado"}
        </Alert>
        <Button variant="light" onClick={() => navigate(voltarPara, {state: origemAnterior})}>
          {rotuloVoltar}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">

      <Modal opened={editando} onClose={() => {if (!salvando) setEditando(false);}} title="Editar cliente" centered closeOnEscape={!salvando} closeOnClickOutside={!salvando} withCloseButton={!salvando}>
          <form onSubmit={(event) => {event.preventDefault(); void salvarEdicao();}}>
              <Stack gap="sm">
                  <TextInput label="Nome" required value={nomeEdicao} onChange={(event) => setNomeEdicao(event.currentTarget.value)}/>
                  <TextInput label="E-mail de contato" type="email" value={emailEdicao} onChange={(event) => setEmailEdicao(event.currentTarget.value)}/>
                  {erroEdicao && <Alert color="red">{erroEdicao}</Alert>}
                  <Group justify="flex-end">
                      <Button variant="default" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</Button>
                      <Button type="submit" loading={salvando}>Salvar alterações</Button>
                  </Group>
              </Stack>
          </form>
      </Modal>

      <Stack gap="xs">
        <Group>
          <Button variant="subtle" size="xs"onClick={() => navigate(voltarPara, {state: origemAnterior})}> ← {rotuloVoltar}</Button>
        </Group>

        <Group justify="space-between" align="center">
            <Title order={1} className={estrutura.heading} style={{ overflowWrap: "anywhere" }}>{cliente.nome}</Title>
            <Group gap="xs"><Button size="xs" onClick={() => navigate(caminhoMensagens(cliente.id), {state: registrarOrigem(`/clientes/${cliente.id}`, location.state)})}>Enviar mensagem</Button><Button size="xs" variant="light" onClick={abrirEdicao}>Editar cliente</Button></Group>
        </Group>

        <Text c="dimmed" size="sm">
          Ficha individual do cliente
        </Text>
      </Stack>

      <Card withBorder padding="lg">
        <Stack gap="sm">
          <Title order={4}>Cadastro</Title>

          <Text>
            <Text span c="dimmed">Nome: </Text>
            {cliente.nome}
          </Text>

          <Text>
            <Text span c="dimmed">E-mail de contato: </Text>
            {cliente.email ?? "Não cadastrado"}
          </Text>

          <Text>
            <Text span c="dimmed">Cliente desde: </Text>
            {new Date(cliente.criadoEm).toLocaleDateString("pt-BR")}
          </Text>
        </Stack>
      </Card>

      <GerenciarAcesso key={cliente.id} clienteId={cliente.id}/>

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
                    navigate(`/projetos/${projeto.id}`, {state: registrarOrigem(`/clientes/${cliente.id}`, location.state)})
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
