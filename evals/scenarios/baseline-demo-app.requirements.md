# Task tracker requirements

The task tracker is used by employees and administrators. Both sign in with an email address and a password.

## REQ-001 Create a task

A signed-in user can create a task from the New task page.

- The form has a Title (required text), a Priority (Low, Medium or High; Medium is the default) and an optional Assignee.
- Submitting a valid form creates the task with status Open and shows it in the task list.
- A task without a title is never created, whichever way the request reaches the application, and the user is told the title is required.

## REQ-002 List and filter tasks

A signed-in user sees the tasks in a table with Title, Status, Priority and Assignee.

- The user can filter the list by status: All, Open, In progress or Done.
- Choosing a status shows only tasks with that status; All shows every task.

## REQ-003 Sort tasks by priority

The task list can be sorted by priority, highest first: High, then Medium, then Low.

## REQ-004 Delete a task

A user can delete a task from its detail page.

- After deleting, the user is told the task was deleted.
- A deleted task no longer appears in the task list and its detail page is no longer available.

## REQ-005 Dashboard greeting

After signing in, the dashboard greets the user by their display name, as "Welcome, <display name>".
