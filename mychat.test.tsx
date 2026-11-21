import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import MyChatScreen from "@/app/mychat";

const mockHandlers: Record<string, (...args: any[]) => void> = {};
const mockLifecycle: Record<string, (() => void) | undefined> = {};
const mockConnection = {
  on: jest.fn(),
  onreconnecting: jest.fn(),
  onreconnected: jest.fn(),
  onclose: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  invoke: jest.fn(),
};

jest.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: jest.fn().mockImplementation(() => {
    const builder: any = {};
    builder.withUrl = jest.fn(() => builder);
    builder.withAutomaticReconnect = jest.fn(() => builder);
    builder.build = jest.fn(() => mockConnection);
    return builder;
  }),
}));

jest.mock("@/api/config", () => ({
  CHAT_HUB_URL: "http://localhost/chat",
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return { SafeAreaView: View };
});

const PLACEHOLDER = "Введіть повідомлення...";

beforeEach(() => {
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  Object.keys(mockLifecycle).forEach((k) => delete mockLifecycle[k]);

  mockConnection.on.mockImplementation((event: string, handler: any) => {
    mockHandlers[event] = handler;
  });
  mockConnection.onreconnecting.mockImplementation((cb: () => void) => {
    mockLifecycle.reconnecting = cb;
  });
  mockConnection.onreconnected.mockImplementation((cb: () => void) => {
    mockLifecycle.reconnected = cb;
  });
  mockConnection.onclose.mockImplementation((cb: () => void) => {
    mockLifecycle.close = cb;
  });
  mockConnection.start.mockResolvedValue(undefined);
  mockConnection.stop.mockResolvedValue(undefined);
  mockConnection.invoke.mockResolvedValue(undefined);
  jest.clearAllMocks();
});

async function renderConnected() {
  const utils = render(<MyChatScreen />);
  await screen.findByText("На зв'язку");
  return utils;
}

describe("MyChatScreen", () => {
  it("shows connecting state until the hub starts", async () => {
    mockConnection.start.mockReturnValue(new Promise(() => {}));
    render(<MyChatScreen />);
    expect(screen.getByText("Підключення...")).toBeTruthy();
  });

  it("shows connected state after the hub starts", async () => {
    await renderConnected();
    expect(mockConnection.start).toHaveBeenCalledTimes(1);
  });

  it("shows disconnected state when the hub cannot start", async () => {
    mockConnection.start.mockRejectedValue(new Error("offline"));
    render(<MyChatScreen />);
    expect(await screen.findByText("Немає з'єднання")).toBeTruthy();
  });

  it("shows the empty placeholder before any message", async () => {
    await renderConnected();
    expect(screen.getByText("Повідомлень ще немає")).toBeTruthy();
  });

  it("renders received messages, newest first", async () => {
    await renderConnected();

    act(() => mockHandlers.Send("Привіт"));
    act(() => mockHandlers.Send("Як справи?"));

    const texts = screen
      .getAllByText(/^(Привіт|Як справи\?)$/)
      .map((node) => node.props.children);
    expect(texts).toEqual(["Як справи?", "Привіт"]);
    expect(screen.queryByText("Повідомлень ще немає")).toBeNull();
  });

  it("does not send when the input is empty or whitespace", async () => {
    await renderConnected();

    fireEvent.press(screen.getByText("Відправити"));
    fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "   ");
    fireEvent.press(screen.getByText("Відправити"));

    expect(mockConnection.invoke).not.toHaveBeenCalled();
  });

  it("sends the trimmed text and clears the input", async () => {
    await renderConnected();
    const input = screen.getByPlaceholderText(PLACEHOLDER);

    fireEvent.changeText(input, "  Привіт світе  ");
    fireEvent.press(screen.getByText("Відправити"));

    await waitFor(() =>
      expect(mockConnection.invoke).toHaveBeenCalledWith("Send", "Привіт світе"),
    );
    await waitFor(() => expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe(""));
  });

  it("keeps the text and shows an error when sending fails", async () => {
    mockConnection.invoke.mockRejectedValue(new Error("fail"));
    await renderConnected();

    fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "Тест");
    fireEvent.press(screen.getByText("Відправити"));

    expect(
      await screen.findByText("Не вдалося надіслати повідомлення. Спробуйте ще раз."),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe("Тест");
  });

  it("does not send while disconnected", async () => {
    await renderConnected();
    act(() => mockLifecycle.close?.());
    expect(screen.getByText("Немає з'єднання")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "Тест");
    fireEvent.press(screen.getByText("Відправити"));

    expect(mockConnection.invoke).not.toHaveBeenCalled();
  });

  it("follows reconnect events", async () => {
    await renderConnected();

    act(() => mockLifecycle.reconnecting?.());
    expect(screen.getByText("Підключення...")).toBeTruthy();

    act(() => mockLifecycle.reconnected?.());
    expect(screen.getByText("На зв'язку")).toBeTruthy();
  });

  it("stops the connection on unmount", async () => {
    const { unmount } = await renderConnected();
    unmount();
    expect(mockConnection.stop).toHaveBeenCalledTimes(1);
  });
});
