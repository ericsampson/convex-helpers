import { getFunctionName } from "convex/server";
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
import type {
  ConvexClientInterface,
  LocalQueryResultClient,
  ConnectionState,
  AuthTokenFetcher,
  MutationOptions,
  Unsubscribe,
} from "convex/browser";
import type { Value } from "convex/values";

type Subscription = {
  args: Record<string, unknown>;
  callback: (result: unknown) => unknown;
  errorCallback?: (e: Error) => unknown;
};

/**
 * A fake ConvexClient for testing Svelte and other non-React apps.
 *
 * Implements ConvexClientInterface from convex/browser (push-based subscriptions).
 * Use registerQueryFake/registerMutationFake/registerActionFake to set up responses.
 * Use triggerQueryUpdate() to simulate real-time updates in tests.
 *
 * @example
 * ```ts
 * import { ConvexClientFake } from "convex-helpers/browser/testing";
 * import { setConvexClientContext } from "convex-svelte";
 * import { api } from "../convex/_generated/api";
 *
 * const mockClient = new ConvexClientFake();
 * mockClient.registerQueryFake(api.todos.list, () => [{ id: "1", title: "Test" }]);
 *
 * setConvexClientContext(mockClient);
 * ```
 */
export class ConvexClientFake implements ConvexClientInterface {
  private queries: Record<string, (args: unknown) => unknown> = {};
  private mutations: Record<string, (args: unknown) => unknown> = {};
  private actions: Record<string, (args: unknown) => unknown> = {};
  private _closed = false;
  private _disabled = false;
  private connectionStateListeners = new Set<
    (state: ConnectionState) => void
  >();
  private subscriptions = new Map<string, Set<Subscription>>();

  // ============ Test Setup Methods ============

  /**
   * Register a fake implementation for a query.
   */
  registerQueryFake<FuncRef extends FunctionReference<"query", "public">>(
    funcRef: FuncRef,
    impl: (args: FuncRef["_args"]) => FuncRef["_returnType"],
  ): void {
    this.queries[getFunctionName(funcRef)] = impl;
  }

  /**
   * Register a fake implementation for a mutation.
   */
  registerMutationFake<FuncRef extends FunctionReference<"mutation", "public">>(
    funcRef: FuncRef,
    impl: (args: FuncRef["_args"]) => FuncRef["_returnType"],
  ): void {
    this.mutations[getFunctionName(funcRef)] = impl;
  }

  /**
   * Register a fake implementation for an action.
   */
  registerActionFake<FuncRef extends FunctionReference<"action", "public">>(
    funcRef: FuncRef,
    impl: (args: FuncRef["_args"]) => FuncRef["_returnType"],
  ): void {
    this.actions[getFunctionName(funcRef)] = impl;
  }

  /**
   * Trigger a query update for all subscribers.
   * Use this to simulate real-time updates from the server.
   */
  triggerQueryUpdate<FuncRef extends FunctionReference<"query", "public">>(
    funcRef: FuncRef,
    result: FuncRef["_returnType"],
  ): void {
    const name = getFunctionName(funcRef);
    const subs = this.subscriptions.get(name);
    if (subs) {
      for (const sub of subs) {
        sub.callback(result);
      }
    }
  }

  /**
   * Trigger an error for all query subscribers.
   * Use this to test error handling.
   */
  triggerQueryError<FuncRef extends FunctionReference<"query", "public">>(
    funcRef: FuncRef,
    error: Error,
  ): void {
    const name = getFunctionName(funcRef);
    const subs = this.subscriptions.get(name);
    if (subs) {
      for (const sub of subs) {
        sub.errorCallback?.(error);
      }
    }
  }

  // ============ ConvexClientInterface Implementation ============

  /**
   * Fake implementation of the internal client for localQueryResult access.
   * Used by convex-svelte for synchronous query result access.
   */
  readonly client: LocalQueryResultClient = {
    localQueryResult: (name: string, args?: Record<string, Value>): Value | undefined => {
      const queryFn = this.queries[name];
      if (queryFn) {
        return queryFn(args ?? {}) as Value;
      }
      return undefined;
    },
  };

  get disabled(): boolean {
    return this._disabled;
  }

  get closed(): boolean {
    return this._closed;
  }

  onUpdate<Query extends FunctionReference<"query">>(
    query: Query,
    args: FunctionArgs<Query>,
    callback: (result: FunctionReturnType<Query>) => unknown,
    onError?: (e: Error) => unknown,
  ): Unsubscribe<Query["_returnType"]> {
    const name = getFunctionName(query);

    const subscription: Subscription = {
      args,
      callback: callback as (result: unknown) => unknown,
      errorCallback: onError,
    };

    if (!this.subscriptions.has(name)) {
      this.subscriptions.set(name, new Set());
    }
    this.subscriptions.get(name)!.add(subscription);

    // Immediately invoke with current result if query is registered
    const queryFn = this.queries[name];
    if (queryFn) {
      try {
        const result = queryFn(args);
        // Use queueMicrotask to make it async like the real client
        queueMicrotask(() => callback(result as FunctionReturnType<Query>));
      } catch (e) {
        if (onError && e instanceof Error) {
          queueMicrotask(() => onError(e as Error));
        }
      }
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(name);
      if (subs) {
        subs.delete(subscription);
      }
    };
  }

  mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
    _options?: MutationOptions,
  ): Promise<Awaited<FunctionReturnType<Mutation>>> {
    const name = getFunctionName(mutation);
    const mutationFn = this.mutations[name];
    if (mutationFn) {
      return Promise.resolve(
        mutationFn(args) as Awaited<FunctionReturnType<Mutation>>,
      );
    }
    return Promise.reject(
      new Error(
        `Unexpected mutation: ${name}. Try calling registerMutationFake() first.`,
      ),
    );
  }

  action<Action extends FunctionReference<"action">>(
    action: Action,
    args: FunctionArgs<Action>,
  ): Promise<Awaited<FunctionReturnType<Action>>> {
    const name = getFunctionName(action);
    const actionFn = this.actions[name];
    if (actionFn) {
      return Promise.resolve(
        actionFn(args) as Awaited<FunctionReturnType<Action>>,
      );
    }
    return Promise.reject(
      new Error(
        `Unexpected action: ${name}. Try calling registerActionFake() first.`,
      ),
    );
  }

  query<Query extends FunctionReference<"query">>(
    query: Query,
    args: Query["_args"],
  ): Promise<Awaited<Query["_returnType"]>> {
    const name = getFunctionName(query);
    const queryFn = this.queries[name];
    if (queryFn) {
      return Promise.resolve(queryFn(args) as Awaited<Query["_returnType"]>);
    }
    return Promise.reject(
      new Error(
        `Unexpected query: ${name}. Try calling registerQueryFake() first.`,
      ),
    );
  }

  connectionState(): ConnectionState {
    return {
      hasInflightRequests: false,
      isWebSocketConnected: true,
      timeOfOldestInflightRequest: null,
      hasEverConnected: true,
      connectionCount: 1,
      connectionRetries: 0,
      inflightMutations: 0,
      inflightActions: 0,
    };
  }

  subscribeToConnectionState(
    callback: (connectionState: ConnectionState) => void,
  ): () => void {
    this.connectionStateListeners.add(callback);
    return () => {
      this.connectionStateListeners.delete(callback);
    };
  }

  setAuth(
    _fetchToken: AuthTokenFetcher,
    _onChange?: (isAuthenticated: boolean) => void,
  ): void {
    // No-op for testing - override if needed
  }

  close(): Promise<void> {
    this._closed = true;
    this.subscriptions.clear();
    this.connectionStateListeners.clear();
    return Promise.resolve();
  }
}
