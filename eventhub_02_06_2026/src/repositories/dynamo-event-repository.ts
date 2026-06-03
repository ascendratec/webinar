import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Event } from '../types';
import { EventRepository } from './interfaces/event-repository';

const TABLE_NAME = process.env.EVENTS_TABLE_NAME ?? '';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export class DynamoEventRepository implements EventRepository {
  async listActiveEvents(): Promise<Event[]> {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':active': 'ACTIVE',
        },
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map((item) => this.mapToEvent(item));
  }

  async getEventById(eventId: string): Promise<Event | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `EVENT#${eventId}`,
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.mapToEvent(result.Item);
  }

  async decrementAvailableSlots(eventId: string): Promise<boolean> {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `EVENT#${eventId}`,
          },
          UpdateExpression: 'SET availableSlots = availableSlots - :one',
          ConditionExpression: 'availableSlots > :zero',
          ExpressionAttributeValues: {
            ':one': 1,
            ':zero': 0,
          },
        })
      );
      return true;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        return false;
      }
      throw error;
    }
  }

  async createEvent(event: Event): Promise<Event> {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `EVENT#${event.eventId}`,
          eventId: event.eventId,
          title: event.title,
          description: event.description,
          date: event.date,
          location: event.location,
          capacity: event.capacity,
          availableSlots: event.availableSlots,
          status: event.status,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
    return event;
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `EVENT#${eventId}`,
          },
          ConditionExpression: 'attribute_exists(pk)',
        })
      );
      return true;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        return false;
      }
      throw error;
    }
  }

  private mapToEvent(item: Record<string, unknown>): Event {
    return {
      eventId: item.eventId as string,
      title: item.title as string,
      description: item.description as string,
      date: item.date as string,
      location: item.location as string,
      capacity: item.capacity as number,
      availableSlots: item.availableSlots as number,
      status: item.status as 'ACTIVE' | 'INACTIVE',
    };
  }
}
