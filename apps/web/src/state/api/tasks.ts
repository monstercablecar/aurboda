import type {
  TaskItemsResponse,
  TaskBoardResponse,
  UpdateTaskBoardBody,
  TaskProjectsResponse,
  CreateTaskItemBody,
  UpdateTaskItemBody,
  CreateTaskProjectBody,
  UpdateTaskProjectBody,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'
const config = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` } })
const get = async <T>(path: string, params = {}) =>
  (await axios.get<T>(`${API_URL}${path}`, { ...config(), params })).data
const post = async <T>(path: string, body: unknown) =>
  (await axios.post<T>(`${API_URL}${path}`, body, config())).data
const patch = async (path: string, body: unknown) =>
  (await axios.patch(`${API_URL}${path}`, body, config())).data
const remove = async (path: string, expected_updated_at: string) =>
  axios.delete(`${API_URL}${path}`, { ...config(), params: { expected_updated_at } })
export const listTasks = (params = {}) => get<TaskItemsResponse>('/tasks/items', params)
export const createTask = (body: CreateTaskItemBody) => post('/tasks/items', body)
export const updateTask = (id: string, body: UpdateTaskItemBody) =>
  patch(`/tasks/items/${encodeURIComponent(id)}`, body)
export const deleteTask = (id: string, version: string) =>
  remove(`/tasks/items/${encodeURIComponent(id)}`, version)
export const listProjects = (params = {}) => get<TaskProjectsResponse>('/tasks/projects', params)
export const createProject = (body: CreateTaskProjectBody) => post('/tasks/projects', body)
export const updateProject = (id: string, body: UpdateTaskProjectBody) =>
  patch(`/tasks/projects/${encodeURIComponent(id)}`, body)
export const deleteProject = (id: string, version: string) =>
  remove(`/tasks/projects/${encodeURIComponent(id)}`, version)

export const getTaskBoard = () => get<TaskBoardResponse>('/tasks/board')
export const updateTaskBoard = (body: UpdateTaskBoardBody): Promise<TaskBoardResponse> =>
  patch('/tasks/board', body)
