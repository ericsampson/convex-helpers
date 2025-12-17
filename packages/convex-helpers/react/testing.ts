import { getFunctionName } from "convex/server";
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
import type {
  ConvexReactClientInterface,
  Watch,
  WatchQueryOptions,
  PaginatedWatch,
  WatchPaginatedQueryOptions,
  PaginationStatus,
  ConnectionState,
  AuthTokenFetcher,
  MutationOptions,
  Logger,
} from "convex/browser";

/**
 * A fake ConvexReactClient for testing React components.
 *
 * Implements ConvexReactClientInterface from convex/browser.
 * Use registerQueryFake/registerMutationFake/registerActionFake to set up responses.
 *
 * @example
 * ```tsx
 * import { ConvexReactClientFake } from "convex-helpers/react/testing";
 * import { ConvexProvider } from "convex/react";
 * import { api } from "../convex/_generated/api";
 *
 * const mockClient = new ConvexReactClientFake();
 * mockClient.registerQueryFake(api.todos.list, () => [{ id: "1", title: "Test" }]);
 *
 * render(
 *   <ConvexProvider client={mockClient}>
 *     <MyComponent />
 *   </ConvexProvider>
 * );
 * ```
 */
export class ConvexReactClientFake implements ConvexReactClientInterface {
  private queries: Record<string, (args: unknown) => unknown> = {};
  private mutations: Record<string, (args: unknown) => unknown> = {};
  private actions: Record<string, (args: unknown) => unknown> = {};
  private _closed = false;
  private _disabled = false;
  private connectionStateListeners = new Set<
    (state: ConnectionState) => void
  >();

  /**
   * A no-op logger for testing. Override if you need to capture log output.
   */
  readonly logger: Logger = {
    logVerbose: () => {},
    log: () => {},
    warn: () => {},
    error: () => {},
  };

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

  // ============ ConvexReactClientInterface Implementation ============

  get disabled(): boolean {
    return this._disabled;
  }

  get closed(): boolean {
    return this._closed;
  }

  watchQuery<Query extends FunctionReference<"query">>(
    query: Query,
    args: FunctionArgs<Query>,
    _options?: WatchQueryOptions,
  ): Watch<FunctionReturnType<Query>> {
    const name = getFunctionName(query);
    const queries = this.queries;
    return {
      localQueryResult: (): FunctionReturnType<Query> | undefined => {
        const queryFn = queries[name];
        if (queryFn) {
          return queryFn(args) as FunctionReturnType<Query>;
        }
        throw new Error(
          `Unexpected query: ${name}. Try calling registerQueryFake() first.`,
        );
      },
      onUpdate: (_callback: () => void): (() => void) => {
        // In a real client this would subscribe to updates.
        // For testing, we just return an unsubscribe function.
        return () => {};
      },
      journal: () => undefined,
    };
  }

  watchPaginatedQuery<Query extends FunctionReference<"query">>(
    query: Query,
    args: Query["_args"],
    _options: WatchPaginatedQueryOptions,
  ): PaginatedWatch<FunctionReturnType<Query>> {
    const name = getFunctionName(query);
    const queries = this.queries;
    return {
      localQueryResult: () => {
        const queryFn = queries[name];
        if (queryFn) {
          const results = queryFn(args) as FunctionReturnType<Query>[];
          return {
            results,
            status: "Exhausted" as PaginationStatus,
            loadMore: (_numItems: number): boolean => {
              // No-op for testing - return false to indicate no more items loaded
              return false;
            },
          };
        }
        return undefined;
      },
      onUpdate: (_callback: () => void): (() => void) => {
        return () => {};
      },
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
    this.connectionStateListeners.clear();
    return Promise.resolve();
  }
}
