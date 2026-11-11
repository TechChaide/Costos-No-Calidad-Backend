// SQL Server puede devolver varios errores juntos (AggregateError) con message vacio
const extractAggregateMessages = (error) => {
  const errors = error?.parent?.errors || error?.original?.errors || [];
  return errors.map(e => e?.message).filter(Boolean).join(' | ');
};

const handleError = (res, error, customMessage = 'Internal server error') => {
  const extractedMessage = error?.message || error?.original?.message || error?.parent?.message || error?.parent?.originalError?.info?.message || extractAggregateMessages(error) || 'Unknown error';

  console.error('Error details:', {
    name: error?.name,
    message: extractedMessage,
    originalMessage: error?.original?.message,
    parentMessage: error?.parent?.message,
    sql: error?.sql,
    parameters: error?.parameters,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });

  // SQL Server specific error handling
  if (error.name === 'SequelizeConnectionError') {
    return res.status(503).json({
      error: 'Database connection failed',
      message: 'Unable to connect to SQL Server',
      code: 'DB_CONNECTION_ERROR'
    });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: error.errors.map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }))
    });
  }

  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Unique constraint violation',
      field: error.errors[0]?.path,
      message: 'Record with this value already exists'
    });
  }

  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: 'Foreign key constraint violation',
      message: 'Referenced record does not exist'
    });
  }

  // Generic error response
  res.status(500).json({
    error: customMessage,
    message: extractedMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

module.exports = { handleError };