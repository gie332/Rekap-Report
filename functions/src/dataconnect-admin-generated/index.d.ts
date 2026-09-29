import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface Comment_Key {
  id: UUIDString;
  __typename?: 'Comment_Key';
}

export interface CreateCommentData {
  comment_insert: Comment_Key;
}

export interface CreateCommentVariables {
  text: string;
  postId: UUIDString;
}

export interface CreateEventData {
  event_insert: Event_Key;
}

export interface CreateEventVariables {
  title: string;
  description: string;
  startTime: TimestampString;
  location: string;
}

export interface CreatePostData {
  post_insert: Post_Key;
}

export interface CreatePostVariables {
  content: string;
  type: string;
}

export interface CreateRsvpData {
  rSVP_insert: RSVP_Key;
}

export interface CreateRsvpVariables {
  eventId: UUIDString;
  status: string;
}

export interface CreateUserData {
  user_insert: User_Key;
}

export interface CreateUserVariables {
  firstName: string;
  lastName: string;
  address: string;
  email: string;
  isVerified: boolean;
}

export interface DeleteCommentData {
  comment_delete?: Comment_Key | null;
}

export interface DeleteCommentVariables {
  id: UUIDString;
}

export interface DeleteEventData {
  event_delete?: Event_Key | null;
}

export interface DeleteEventVariables {
  id: UUIDString;
}

export interface DeletePostData {
  post_delete?: Post_Key | null;
}

export interface DeletePostVariables {
  id: UUIDString;
}

export interface DeleteRsvpData {
  rSVP_delete?: RSVP_Key | null;
}

export interface DeleteRsvpVariables {
  eventId: UUIDString;
}

export interface DeleteUserData {
  user_delete?: User_Key | null;
}

export interface Event_Key {
  id: UUIDString;
  __typename?: 'Event_Key';
}

export interface GetCommentsForPostData {
  comments: ({
    text: string;
    createdAt: TimestampString;
    author: {
      firstName: string;
    };
  })[];
}

export interface GetCommentsForPostVariables {
  postId: UUIDString;
}

export interface GetEventData {
  event?: {
    title: string;
    description: string;
    startTime: TimestampString;
    location: string;
  };
}

export interface GetEventVariables {
  id: UUIDString;
}

export interface GetMessagesData {
  messages: ({
    text: string;
    timestamp: TimestampString;
    sender: {
      firstName: string;
    };
  })[];
}

export interface GetMyUserData {
  user?: {
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    isVerified: boolean;
  };
}

export interface GetPostData {
  post?: {
    content: string;
    type: string;
    createdAt: TimestampString;
    author: {
      firstName: string;
    };
  };
}

export interface GetPostVariables {
  id: UUIDString;
}

export interface ListAllUsersData {
  users: ({
    firstName: string;
    lastName: string;
  })[];
}

export interface ListEventsData {
  events: ({
    title: string;
    startTime: TimestampString;
  })[];
}

export interface ListMyRsvPsData {
  rSVPS: ({
    status: string;
    event: {
      title: string;
    };
  })[];
}

export interface ListPostsData {
  posts: ({
    content: string;
    createdAt: TimestampString;
  })[];
}

export interface Message_Key {
  id: UUIDString;
  __typename?: 'Message_Key';
}

export interface Post_Key {
  id: UUIDString;
  __typename?: 'Post_Key';
}

export interface RSVP_Key {
  userId: UUIDString;
  eventId: UUIDString;
  __typename?: 'RSVP_Key';
}

export interface SendMessageData {
  message_insert: Message_Key;
}

export interface SendMessageVariables {
  text: string;
  recipientId: UUIDString;
}

export interface UpdateEventData {
  event_update?: Event_Key | null;
}

export interface UpdateEventVariables {
  id: UUIDString;
  title?: string | null;
}

export interface UpdatePostData {
  post_update?: Post_Key | null;
}

export interface UpdatePostVariables {
  id: UUIDString;
  content?: string | null;
}

export interface UpdateRsvpData {
  rSVP_update?: RSVP_Key | null;
}

export interface UpdateRsvpVariables {
  eventId: UUIDString;
  status: string;
}

export interface UpdateUserData {
  user_update?: User_Key | null;
}

export interface UpdateUserVariables {
  firstName?: string | null;
  lastName?: string | null;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'CreateUser' Mutation. Allow users to execute without passing in DataConnect. */
export function createUser(dc: DataConnect, vars: CreateUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateUserData>>;
/** Generated Node Admin SDK operation action function for the 'CreateUser' Mutation. Allow users to pass in custom DataConnect instances. */
export function createUser(vars: CreateUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateUserData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateUser' Mutation. Allow users to execute without passing in DataConnect. */
export function updateUser(dc: DataConnect, vars?: UpdateUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateUserData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateUser' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateUser(vars?: UpdateUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateUserData>>;

/** Generated Node Admin SDK operation action function for the 'DeleteUser' Mutation. Allow users to execute without passing in DataConnect. */
export function deleteUser(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteUserData>>;
/** Generated Node Admin SDK operation action function for the 'DeleteUser' Mutation. Allow users to pass in custom DataConnect instances. */
export function deleteUser(options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteUserData>>;

/** Generated Node Admin SDK operation action function for the 'GetMyUser' Query. Allow users to execute without passing in DataConnect. */
export function getMyUser(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<GetMyUserData>>;
/** Generated Node Admin SDK operation action function for the 'GetMyUser' Query. Allow users to pass in custom DataConnect instances. */
export function getMyUser(options?: OperationOptions): Promise<ExecuteOperationResponse<GetMyUserData>>;

/** Generated Node Admin SDK operation action function for the 'ListAllUsers' Query. Allow users to execute without passing in DataConnect. */
export function listAllUsers(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListAllUsersData>>;
/** Generated Node Admin SDK operation action function for the 'ListAllUsers' Query. Allow users to pass in custom DataConnect instances. */
export function listAllUsers(options?: OperationOptions): Promise<ExecuteOperationResponse<ListAllUsersData>>;

/** Generated Node Admin SDK operation action function for the 'CreatePost' Mutation. Allow users to execute without passing in DataConnect. */
export function createPost(dc: DataConnect, vars: CreatePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreatePostData>>;
/** Generated Node Admin SDK operation action function for the 'CreatePost' Mutation. Allow users to pass in custom DataConnect instances. */
export function createPost(vars: CreatePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreatePostData>>;

/** Generated Node Admin SDK operation action function for the 'UpdatePost' Mutation. Allow users to execute without passing in DataConnect. */
export function updatePost(dc: DataConnect, vars: UpdatePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdatePostData>>;
/** Generated Node Admin SDK operation action function for the 'UpdatePost' Mutation. Allow users to pass in custom DataConnect instances. */
export function updatePost(vars: UpdatePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdatePostData>>;

/** Generated Node Admin SDK operation action function for the 'DeletePost' Mutation. Allow users to execute without passing in DataConnect. */
export function deletePost(dc: DataConnect, vars: DeletePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeletePostData>>;
/** Generated Node Admin SDK operation action function for the 'DeletePost' Mutation. Allow users to pass in custom DataConnect instances. */
export function deletePost(vars: DeletePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeletePostData>>;

/** Generated Node Admin SDK operation action function for the 'GetPost' Query. Allow users to execute without passing in DataConnect. */
export function getPost(dc: DataConnect, vars: GetPostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetPostData>>;
/** Generated Node Admin SDK operation action function for the 'GetPost' Query. Allow users to pass in custom DataConnect instances. */
export function getPost(vars: GetPostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetPostData>>;

/** Generated Node Admin SDK operation action function for the 'ListPosts' Query. Allow users to execute without passing in DataConnect. */
export function listPosts(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListPostsData>>;
/** Generated Node Admin SDK operation action function for the 'ListPosts' Query. Allow users to pass in custom DataConnect instances. */
export function listPosts(options?: OperationOptions): Promise<ExecuteOperationResponse<ListPostsData>>;

/** Generated Node Admin SDK operation action function for the 'CreateEvent' Mutation. Allow users to execute without passing in DataConnect. */
export function createEvent(dc: DataConnect, vars: CreateEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateEventData>>;
/** Generated Node Admin SDK operation action function for the 'CreateEvent' Mutation. Allow users to pass in custom DataConnect instances. */
export function createEvent(vars: CreateEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateEventData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateEvent' Mutation. Allow users to execute without passing in DataConnect. */
export function updateEvent(dc: DataConnect, vars: UpdateEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateEventData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateEvent' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateEvent(vars: UpdateEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateEventData>>;

/** Generated Node Admin SDK operation action function for the 'DeleteEvent' Mutation. Allow users to execute without passing in DataConnect. */
export function deleteEvent(dc: DataConnect, vars: DeleteEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteEventData>>;
/** Generated Node Admin SDK operation action function for the 'DeleteEvent' Mutation. Allow users to pass in custom DataConnect instances. */
export function deleteEvent(vars: DeleteEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteEventData>>;

/** Generated Node Admin SDK operation action function for the 'GetEvent' Query. Allow users to execute without passing in DataConnect. */
export function getEvent(dc: DataConnect, vars: GetEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetEventData>>;
/** Generated Node Admin SDK operation action function for the 'GetEvent' Query. Allow users to pass in custom DataConnect instances. */
export function getEvent(vars: GetEventVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetEventData>>;

/** Generated Node Admin SDK operation action function for the 'ListEvents' Query. Allow users to execute without passing in DataConnect. */
export function listEvents(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListEventsData>>;
/** Generated Node Admin SDK operation action function for the 'ListEvents' Query. Allow users to pass in custom DataConnect instances. */
export function listEvents(options?: OperationOptions): Promise<ExecuteOperationResponse<ListEventsData>>;

/** Generated Node Admin SDK operation action function for the 'CreateComment' Mutation. Allow users to execute without passing in DataConnect. */
export function createComment(dc: DataConnect, vars: CreateCommentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCommentData>>;
/** Generated Node Admin SDK operation action function for the 'CreateComment' Mutation. Allow users to pass in custom DataConnect instances. */
export function createComment(vars: CreateCommentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCommentData>>;

/** Generated Node Admin SDK operation action function for the 'DeleteComment' Mutation. Allow users to execute without passing in DataConnect. */
export function deleteComment(dc: DataConnect, vars: DeleteCommentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteCommentData>>;
/** Generated Node Admin SDK operation action function for the 'DeleteComment' Mutation. Allow users to pass in custom DataConnect instances. */
export function deleteComment(vars: DeleteCommentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteCommentData>>;

/** Generated Node Admin SDK operation action function for the 'GetCommentsForPost' Query. Allow users to execute without passing in DataConnect. */
export function getCommentsForPost(dc: DataConnect, vars: GetCommentsForPostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCommentsForPostData>>;
/** Generated Node Admin SDK operation action function for the 'GetCommentsForPost' Query. Allow users to pass in custom DataConnect instances. */
export function getCommentsForPost(vars: GetCommentsForPostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCommentsForPostData>>;

/** Generated Node Admin SDK operation action function for the 'CreateRsvp' Mutation. Allow users to execute without passing in DataConnect. */
export function createRsvp(dc: DataConnect, vars: CreateRsvpVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateRsvpData>>;
/** Generated Node Admin SDK operation action function for the 'CreateRsvp' Mutation. Allow users to pass in custom DataConnect instances. */
export function createRsvp(vars: CreateRsvpVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateRsvpData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateRsvp' Mutation. Allow users to execute without passing in DataConnect. */
export function updateRsvp(dc: DataConnect, vars: UpdateRsvpVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateRsvpData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateRsvp' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateRsvp(vars: UpdateRsvpVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateRsvpData>>;

/** Generated Node Admin SDK operation action function for the 'DeleteRsvp' Mutation. Allow users to execute without passing in DataConnect. */
export function deleteRsvp(dc: DataConnect, vars: DeleteRsvpVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteRsvpData>>;
/** Generated Node Admin SDK operation action function for the 'DeleteRsvp' Mutation. Allow users to pass in custom DataConnect instances. */
export function deleteRsvp(vars: DeleteRsvpVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteRsvpData>>;

/** Generated Node Admin SDK operation action function for the 'ListMyRsvPs' Query. Allow users to execute without passing in DataConnect. */
export function listMyRsvPs(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListMyRsvPsData>>;
/** Generated Node Admin SDK operation action function for the 'ListMyRsvPs' Query. Allow users to pass in custom DataConnect instances. */
export function listMyRsvPs(options?: OperationOptions): Promise<ExecuteOperationResponse<ListMyRsvPsData>>;

/** Generated Node Admin SDK operation action function for the 'SendMessage' Mutation. Allow users to execute without passing in DataConnect. */
export function sendMessage(dc: DataConnect, vars: SendMessageVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SendMessageData>>;
/** Generated Node Admin SDK operation action function for the 'SendMessage' Mutation. Allow users to pass in custom DataConnect instances. */
export function sendMessage(vars: SendMessageVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SendMessageData>>;

/** Generated Node Admin SDK operation action function for the 'GetMessages' Query. Allow users to execute without passing in DataConnect. */
export function getMessages(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<GetMessagesData>>;
/** Generated Node Admin SDK operation action function for the 'GetMessages' Query. Allow users to pass in custom DataConnect instances. */
export function getMessages(options?: OperationOptions): Promise<ExecuteOperationResponse<GetMessagesData>>;

