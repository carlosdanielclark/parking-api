import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectConnection as InjectMongoConnection } from '@nestjs/mongoose';
import { Connection as MongooseConnection } from 'mongoose';

@Injectable()
export class DatabaseTestService implements OnApplicationBootstrap {
  constructor(
    private readonly dataSource: DataSource, // Reemplaza Connection de TypeORM
    @InjectMongoConnection() private readonly mongoConnection: MongooseConnection,
  ) {}

  async onApplicationBootstrap() {
    await this.testPostgreSQLConnection();
    await this.testMongoDBConnection();
  }

  async testPostgreSQLConnection() {
    try {
      const result = await this.dataSource.query('SELECT NOW()');
      console.log('✅ PostgreSQL connection successful:', result[0].now);
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
    }
  }

  async testMongoDBConnection() {
    try {
      if (!this.mongoConnection) {
        throw new Error('MongoDB connection is undefined');
      }
      const result = await this.mongoConnection.db!.admin().ping();
      console.log('✅ MongoDB connection successful:', result);
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
    }
  }
}
